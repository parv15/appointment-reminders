import type { Config } from './config.js';
import type { Messenger } from './messenger.js';
import { explainSentError } from './errors.js';
import { classifyReply } from './replies.js';
import type { Appointment, Store } from './store.js';

const FINAL = new Set(['delivered', 'read', 'failed', 'blocked', 'cancelled']);
const lastSync = new Map<string, number>();
const MIN_SCHEDULE_AHEAD_MS = 2 * 60_000;
const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 60 * 60_000;

export class ValidationError extends Error {}

export interface InboundPayload {
  inbound_number: string;
  channel: string;
  text?: string | null;
}

export type BookingResult = Appointment & { confirmationError?: string };

export interface Reminders {
  book(input: { name: string; phone: string; startsAt: string }): Promise<BookingResult>;
  syncStatuses(): Promise<void>;
  cancel(id: string): Promise<Appointment | undefined>;
  handleInbound(payload: InboundPayload): Promise<void>;
  handleStatus(event: string, payload: { message_id?: string }): void;
}

export function createReminders(deps: { store: Store; messenger: Messenger; config: Config; now?: () => Date }): Reminders {
  const { store, messenger, config } = deps;
  const now = deps.now ?? (() => new Date());

  const format = (startsAt: string) => {
    const date = new Date(startsAt);
    const clean = (value: string) => value.replace(/[\u202f\u00a0]/g, ' ');
    return {
      date: clean(new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, dateStyle: 'medium' }).format(date)),
      time: clean(new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, timeStyle: 'short' }).format(date)),
    };
  };

  const reply = (to: string, channel: string, text: string) => messenger.send({ to, channel, text });

  return {
    async book({ name, phone, startsAt }) {
      const start = new Date(startsAt);
      const sendAt = start.getTime() - config.reminderLeadMinutes * 60_000;
      const current = now().getTime();
      if (start.getTime() <= current) {
        throw new ValidationError('The appointment time must be in the future.');
      }
      if (sendAt - current > MAX_SCHEDULE_AHEAD_MS) {
        throw new ValidationError('Reminders can be scheduled at most 30 days ahead. Pick a sooner appointment time.');
      }

      const appointment = store.create({ name, phone, startsAt });
      const { date, time } = format(startsAt);
      const scheduleLater = sendAt - current >= MIN_SCHEDULE_AHEAD_MS;
      const baseParameters = { customer_name: name, business_name: config.businessName, appointment_date: date, appointment_time: time };

      try {
        const messageId = await messenger.send({
          to: phone,
          template: {
            name: config.templateName,
            parameters: baseParameters,
          },
          ...(scheduleLater && { scheduledAt: new Date(sendAt) }),
          idempotencyKey: `reminder-${appointment.id}`,
        });
        store.setReminder(appointment.id, messageId);
      } catch (err) {
        store.delete(appointment.id);
        throw err;
      }

      let confirmationError: string | undefined;
      if (config.confirmationTemplateName) {
        try {
          const messageId = await messenger.send({
            to: phone,
            template: {
              name: config.confirmationTemplateName,
              parameters: { ...baseParameters, service_name: config.serviceName },
            },
            idempotencyKey: `confirmation-${appointment.id}`,
          });
          store.setConfirmation(appointment.id, messageId);
        } catch (err) {
          confirmationError = explainSentError(err)?.message ?? 'The booking alert could not be sent.';
          console.error(`Booking alert for ${appointment.id} failed: ${confirmationError}`);
        }
      }
      return { ...store.get(appointment.id)!, ...(confirmationError && { confirmationError }) };
    },

    async syncStatuses() {
      const lookup = messenger.status?.bind(messenger);
      if (!lookup || config.sandbox) return;
      const at = Date.now();
      const pending: [string, string | null][] = [];
      for (const a of store.list()) {
        if (a.status === 'cancelled') continue;
        pending.push([a.reminderMessageId ?? '', a.reminderStatus], [a.confirmationMessageId ?? '', a.confirmationStatus]);
      }
      await Promise.allSettled(
        pending
          .filter(([id, status]) => id && !FINAL.has(status ?? ''))
          .filter(([id, status]) => at - (lastSync.get(id) ?? 0) > (status === 'scheduled' ? 60_000 : 4_000))
          .map(async ([id]) => {
            lastSync.set(id, at);
            const status = await lookup(id);
            if (status) store.setMessageStatus(id, status);
          }),
      );
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

      const appointment = store.findUpcomingByPhone(payload.inbound_number, now());
      if (!appointment) return;
      store.setLastReply(appointment.id, payload.text ?? '', now());

      const { date, time } = format(appointment.startsAt);
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
  };
}
