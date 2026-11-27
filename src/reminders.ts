import type { Config } from './config';
import { explainSentError } from './errors';
import { DELIVERY_CHANNELS, type Messenger } from './messenger';
import { classifyReply } from './replies';
import { SlotTakenError, type Appointment, type Store } from './store';

const MIN_SCHEDULE_AHEAD_MS = 2 * 60_000;
const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 60 * 60_000;
const FINAL_STATUSES = new Set(['delivered', 'read', 'failed', 'blocked', 'cancelled']);
export const MAX_UPCOMING_PER_PHONE = 3;
const POLL_INTERVAL_MS = 4_000;
const SCHEDULED_POLL_INTERVAL_MS = 60_000;

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

class NoticeError extends Error {}

export interface InboundPayload {
  inbound_number: string;
  outbound_number?: string | null;
  channel?: string | null;
  text?: string | null;
}

export interface BookingRequest {
  name: string;
  service: string;
  phone: string;
  startsAt: string;
  reminderMinutes?: number;
}

export interface RescheduleRequest {
  startsAt: string;
  reminderMinutes?: number;
}

export type BookingResult = Appointment & { confirmationError?: string };

export interface Reminders {
  book(request: BookingRequest): Promise<BookingResult>;
  reschedule(id: string, request: RescheduleRequest): Promise<BookingResult | undefined>;
  cancel(id: string): Promise<BookingResult | undefined>;
  handleInbound(payload: InboundPayload): Promise<void>;
  handleStatus(event: string, payload: { message_id?: string; channel?: string; reason?: string }): Promise<void>;
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

  const textParameters = (appointment: Appointment) => {
    const { date, time } = formatInZone(appointment.startsAt);
    return { customer_name: appointment.name, business_name: config.businessName, appointment_date: date, appointment_time: time };
  };

  const pick = (all: Record<string, string>, fields?: string[]) =>
    fields ? Object.fromEntries(Object.entries(all).filter(([key]) => fields.includes(key))) : all;

  const reply = async (to: string, channel: string | undefined, text: string, from?: string | null) => {
    try {
      await messenger.send({ to, channel, text, ...(from && { from }) });
    } catch (err) {
      console.error(`Reply to ${to} failed: ${explainSentError(err)?.message ?? (err instanceof Error ? err.message : err)}`);
    }
  };

  function chooseLead(startsAt: Date, requested?: number): number {
    const now = Date.now();
    const feasible = (lead: number) => startsAt.getTime() - lead * 60_000 - now >= MIN_SCHEDULE_AHEAD_MS;

    if (requested !== undefined) {
      if (!config.reminderOptions.includes(requested)) {
        throw new ValidationError('Choose one of the offered reminder times.', 'slot_unavailable');
      }
      if (!feasible(requested)) {
        throw new ValidationError('That reminder time has already passed. Choose a shorter reminder or a later appointment.', 'slot_unavailable');
      }
      return requested;
    }

    const lead = config.reminderOptions.find(feasible);
    if (lead === undefined) {
      throw new ValidationError('That appointment is too soon for a reminder. Choose a later time.', 'slot_unavailable');
    }
    return lead;
  }

  function assertSchedulable(startsAt: Date, lead: number) {
    if (startsAt.getTime() <= Date.now()) {
      throw new ValidationError('The appointment time must be in the future.', 'slot_unavailable');
    }
    if (startsAt.getTime() - lead * 60_000 - Date.now() > MAX_SCHEDULE_AHEAD_MS) {
      throw new ValidationError('Reminders can be scheduled at most 30 days ahead. Pick a sooner appointment time.', 'slot_unavailable');
    }
  }

  async function scheduleReminder(appointment: Appointment, lead: number, key: string): Promise<string> {
    return messenger.send({
      to: appointment.phone,
      template: { name: config.templateName, parameters: textParameters(appointment) },
      scheduledAt: new Date(new Date(appointment.startsAt).getTime() - lead * 60_000),
      idempotencyKey: key,
    });
  }

  async function sendNotice(appointment: Appointment, templateName: string, key: string, extra: Record<string, string> = {}, fields?: string[]) {
    if (!templateName) return undefined;
    try {
      return await messenger.send({
        to: appointment.phone,
        template: { name: templateName, parameters: pick({ ...textParameters(appointment), ...extra }, fields) },
        idempotencyKey: key,
      });
    } catch (err) {
      const reason = explainSentError(err)?.message ?? 'The text could not be sent.';
      console.error(`Text for ${appointment.id} failed: ${reason}`);
      throw new NoticeError(reason);
    }
  }

  return {
    async book({ name, service, phone, startsAt: requested, reminderMinutes }) {
      const start = new Date(requested);
      const lead = chooseLead(start, reminderMinutes);
      assertSchedulable(start, lead);
      const startsAt = start.toISOString();

      const repeat = await store.findActive(phone, startsAt);
      if (repeat) return repeat;

      if ((await store.takenStarts()).has(startsAt)) {
        throw new ValidationError('That time was just taken. Please pick another slot.', 'slot_unavailable');
      }
      if (await store.countUpcomingByPhone(phone, new Date()) >= MAX_UPCOMING_PER_PHONE) {
        throw new ValidationError(`This number already has ${MAX_UPCOMING_PER_PHONE} upcoming appointments. Cancel one before booking another.`);
      }

      let appointment: Appointment;
      try {
        appointment = await store.create({ name, service, phone, startsAt, reminderLeadMinutes: lead });
      } catch (err) {
        throw err instanceof SlotTakenError ? new ValidationError('That time was just taken. Please pick another slot.', 'slot_unavailable') : err;
      }

      let reminderId: string;
      try {
        reminderId = await scheduleReminder(appointment, lead, `reminder-${appointment.id}`);
      } catch (err) {
        await store.delete(appointment.id);
        throw err;
      }
      try {
        await store.setReminder(appointment.id, reminderId);
      } catch (err) {
        await messenger.cancel(reminderId).catch(() => undefined);
        await store.delete(appointment.id);
        throw err;
      }

      let confirmationError: string | undefined;
      try {
        const messageId = await sendNotice(appointment, config.confirmationTemplateName, `confirmation-${appointment.id}`, { service_name: service });
        if (messageId) await store.setConfirmation(appointment.id, messageId);
      } catch (err) {
        confirmationError = err instanceof NoticeError ? err.message : 'The booking text could not be sent.';
      }
      return { ...(await store.get(appointment.id))!, ...(confirmationError && { confirmationError }) };
    },

    async reschedule(id, { startsAt: requested, reminderMinutes }) {
      const current = await store.get(id);
      if (!current || current.status === 'cancelled') return undefined;

      const start = new Date(requested);
      const lead = chooseLead(start, reminderMinutes ?? current.reminderLeadMinutes ?? undefined);
      assertSchedulable(start, lead);
      if ((await store.takenStarts(id)).has(start.toISOString())) {
        throw new ValidationError('That time is taken. Pick another slot.', 'slot_unavailable');
      }
      if (start.toISOString() === current.startsAt && lead === current.reminderLeadMinutes && current.status !== 'reschedule_requested') {
        return current;
      }

      const moved = { ...current, startsAt: start.toISOString() };
      const newReminderId = await scheduleReminder(moved, lead, `reminder-${id}-${start.getTime()}`);
      try {
        if (current.reminderMessageId) await messenger.cancel(current.reminderMessageId);
      } catch (err) {
        await messenger.cancel(newReminderId).catch(() => undefined);
        throw err;
      }

      try {
        await store.reschedule(id, moved.startsAt, lead);
      } catch (err) {
        await messenger.cancel(newReminderId).catch(() => undefined);
        throw err instanceof SlotTakenError ? new ValidationError('That time is taken. Pick another slot.', 'slot_unavailable') : err;
      }
      await store.setReminder(id, newReminderId);

      let confirmationError: string | undefined;
      try {
        const messageId = await sendNotice(moved, config.rescheduleTemplateName, `reschedule-${id}-${start.getTime()}`);
        if (messageId) await store.setConfirmation(id, messageId);
      } catch (err) {
        confirmationError = err instanceof NoticeError ? err.message : 'The reschedule text could not be sent.';
      }
      return { ...(await store.get(id))!, ...(confirmationError && { confirmationError }) };
    },

    async cancel(id) {
      const appointment = await store.get(id);
      if (!appointment) return undefined;
      if (appointment.status === 'cancelled') return appointment;
      if (appointment.reminderMessageId) {
        await messenger.cancel(appointment.reminderMessageId);
      }
      await store.setStatus(id, 'cancelled');

      let confirmationError: string | undefined;
      try {
        const messageId = await sendNotice(appointment, config.cancellationTemplateName, `cancel-${id}`, {}, ['customer_name', 'appointment_date']);
        if (messageId) await store.setConfirmation(id, messageId);
      } catch (err) {
        confirmationError = err instanceof NoticeError ? err.message : 'The cancellation text could not be sent.';
      }
      return { ...(await store.get(id))!, ...(confirmationError && { confirmationError }) };
    },

    async handleInbound(payload) {
      const text = typeof payload.text === 'string' ? payload.text : '';
      const intent = classifyReply(text);
      if (intent === 'compliance') return;

      const phone = payload.inbound_number.trim().startsWith('+') ? payload.inbound_number.trim() : `+${payload.inbound_number.trim()}`;
      const channel = payload.channel?.toLowerCase();
      const replyChannel = channel && DELIVERY_CHANNELS.has(channel) ? channel : undefined;

      const appointment = await store.findUpcomingByPhone(phone, new Date());
      if (!appointment) return;
      await store.setLastReply(appointment.id, text, new Date());

      const { date, time } = formatInZone(appointment.startsAt);
      if (intent === 'confirm') {
        await store.setStatus(appointment.id, 'confirmed');
        await reply(phone, replyChannel, `Thanks ${appointment.name}, your appointment on ${date} at ${time} is confirmed.`, payload.outbound_number);
      } else if (intent === 'reschedule') {
        await store.setStatus(appointment.id, 'reschedule_requested');
        await reply(phone, replyChannel, `No problem ${appointment.name}. We will contact you shortly to find a new time.`, payload.outbound_number);
      } else {
        await reply(phone, replyChannel, `Your appointment is on ${date} at ${time}. Reply C to confirm or R to reschedule.`, payload.outbound_number);
      }
    },

    async handleStatus(event, payload) {
      if (payload.message_id) {
        const channel = payload.channel?.toLowerCase();
        const reason = typeof payload.reason === 'string' ? payload.reason : undefined;
        await store.setMessageStatus(payload.message_id, event.replace(/^message\./, ''), channel && DELIVERY_CHANNELS.has(channel) ? channel : undefined, reason);
      }
    },

    async syncStatuses() {
      if (config.sandbox) return;
      const now = Date.now();

      const tracked = (await store.list())
        .filter((a) => a.status !== 'cancelled')
        .flatMap((a) => [
          { id: a.reminderMessageId, status: a.reminderStatus, channel: a.reminderChannel },
          { id: a.confirmationMessageId, status: a.confirmationStatus, channel: a.confirmationChannel },
        ]);

      await Promise.allSettled(
        tracked
          .filter((m): m is { id: string; status: string | null; channel: string | null } => m.id !== null)
          .filter((m) => !FINAL_STATUSES.has(m.status ?? '') || (m.channel === null && !lastPolled.has(m.id)))
          .filter((m) => now - (lastPolled.get(m.id) ?? 0) > (m.status === 'scheduled' ? SCHEDULED_POLL_INTERVAL_MS : POLL_INTERVAL_MS))
          .map(async ({ id }) => {
            lastPolled.set(id, now);
            const { status, channel, reason } = await messenger.status(id);
            if (status) await store.setMessageStatus(id, status, channel, reason);
          }),
      );
    },
  };
}
