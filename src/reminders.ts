import type { Config } from './config.js';
import { explainSentError } from './errors.js';
import type { Messenger } from './messenger.js';
import { classifyReply } from './replies.js';
import type { Appointment, Store } from './store.js';

const MIN_SCHEDULE_AHEAD_MS = 2 * 60_000;
const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 60 * 60_000;
const FINAL_STATUSES = new Set(['delivered', 'read', 'failed', 'blocked', 'cancelled']);
const POLL_INTERVAL_MS = 4_000;
const SCHEDULED_POLL_INTERVAL_MS = 60_000;

export class ValidationError extends Error {}

export interface InboundPayload {
  inbound_number: string;
  channel: string;
  text?: string | null;
}

export interface BookingRequest {
  name: string;
  service: string;
  phone: string;
  startsAt: string;
}

export type BookingResult = Appointment & { confirmationError?: string };

export interface Reminders {
  book(request: BookingRequest): Promise<BookingResult>;
  cancel(id: string): Promise<Appointment | undefined>;
  handleInbound(payload: InboundPayload): Promise<void>;
  handleStatus(event: string, payload: { message_id?: string }): void;
  syncStatuses(): Promise<void>;
}

export function createReminders(deps: { store: Store; messenger: Messenger; config: Config }): Reminders {
  const { store, messenger, config } = deps;
  const lastPolled = new Map<string, number>();

  const formatInZone = (startsAt: string) => {
    const instant = new Date(startsAt);
    const format = (style: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, ...style }).format(instant).replace(/[\u202f\u00a0]/g, ' ');
    return { date: format({ dateStyle: 'medium' }), time: format({ timeStyle: 'short' }) };
  };

  const reply = (to: string, channel: string, text: string) => messenger.send({ to, channel, text });

  async function sendReminder(appointment: Appointment, parameters: Record<string, string>, releaseAt: number) {
    const messageId = await messenger.send({
      to: appointment.phone,
      template: { name: config.templateName, parameters },
      ...(releaseAt - Date.now() >= MIN_SCHEDULE_AHEAD_MS && { scheduledAt: new Date(releaseAt) }),
      idempotencyKey: `reminder-${appointment.id}`,
    });
    store.setReminder(appointment.id, messageId);
  }

  async function sendBookingAlert(appointment: Appointment, parameters: Record<string, string>): Promise<string | undefined> {
    if (!config.confirmationTemplateName) return undefined;
    try {
      const messageId = await messenger.send({
        to: appointment.phone,
        template: { name: config.confirmationTemplateName, parameters: { ...parameters, service_name: appointment.service } },
        idempotencyKey: `confirmation-${appointment.id}`,
      });
      store.setConfirmation(appointment.id, messageId);
      return undefined;
    } catch (err) {
      const reason = explainSentError(err)?.message ?? 'The booking alert could not be sent.';
      console.error(`Booking alert for ${appointment.id} failed: ${reason}`);
      return reason;
    }
  }

  return {
    async book({ name, service, phone, startsAt: requested }) {
      const start = new Date(requested);
      const releaseAt = start.getTime() - config.reminderLeadMinutes * 60_000;
      if (start.getTime() <= Date.now()) {
        throw new ValidationError('The appointment time must be in the future.');
      }
      if (releaseAt - Date.now() > MAX_SCHEDULE_AHEAD_MS) {
        throw new ValidationError('Reminders can be scheduled at most 30 days ahead. Pick a sooner appointment time.');
      }
      if (store.takenStarts().has(start.toISOString())) {
        throw new ValidationError('That time was just taken. Please pick another slot.');
      }

      const appointment = store.create({ name, service, phone, startsAt: start.toISOString() });
      const { date, time } = formatInZone(appointment.startsAt);
      const parameters = { customer_name: name, business_name: config.businessName, appointment_date: date, appointment_time: time };

      try {
        await sendReminder(appointment, parameters, releaseAt);
      } catch (err) {
        store.delete(appointment.id);
        throw err;
      }
      const confirmationError = await sendBookingAlert(appointment, parameters);
      return { ...store.get(appointment.id)!, ...(confirmationError && { confirmationError }) };
    },

    async cancel(id) {
      const appointment = store.get(id);
      if (!appointment) return undefined;
      if (appointment.status !== 'cancelled' && appointment.reminderMessageId) {
        await messenger.cancel(appointment.reminderMessageId);
      }
      store.setStatus(id, 'cancelled');
      return store.get(id);
    },

    async handleInbound(payload) {
      const intent = classifyReply(payload.text);
      if (intent === 'compliance') return;

      const appointment = store.findUpcomingByPhone(payload.inbound_number, new Date());
      if (!appointment) return;
      store.setLastReply(appointment.id, payload.text ?? '', new Date());

      const { date, time } = formatInZone(appointment.startsAt);
      if (intent === 'confirm') {
        store.setStatus(appointment.id, 'confirmed');
        await reply(payload.inbound_number, payload.channel, `Thanks ${appointment.name}, your appointment on ${date} at ${time} is confirmed.`);
      } else if (intent === 'reschedule') {
        store.setStatus(appointment.id, 'reschedule_requested');
        await reply(payload.inbound_number, payload.channel, `No problem ${appointment.name}. We will contact you shortly to find a new time.`);
      } else {
        await reply(payload.inbound_number, payload.channel, `Your appointment is on ${date} at ${time}. Reply C to confirm or R to reschedule.`);
      }
    },

    handleStatus(event, payload) {
      if (payload.message_id) {
        store.setMessageStatus(payload.message_id, event.replace(/^message\./, ''));
      }
    },

    async syncStatuses() {
      if (!messenger.status || config.sandbox) return;
      const lookup = messenger.status.bind(messenger);
      const now = Date.now();

      const tracked = store
        .list()
        .filter((a) => a.status !== 'cancelled')
        .flatMap((a) => [
          { id: a.reminderMessageId, status: a.reminderStatus },
          { id: a.confirmationMessageId, status: a.confirmationStatus },
        ]);

      await Promise.allSettled(
        tracked
          .filter((m): m is { id: string; status: string | null } => m.id !== null && !FINAL_STATUSES.has(m.status ?? ''))
          .filter((m) => now - (lastPolled.get(m.id) ?? 0) > (m.status === 'scheduled' ? SCHEDULED_POLL_INTERVAL_MS : POLL_INTERVAL_MS))
          .map(async ({ id }) => {
            lastPolled.set(id, now);
            const status = await lookup(id);
            if (status) store.setMessageStatus(id, status);
          }),
      );
    },
  };
}
