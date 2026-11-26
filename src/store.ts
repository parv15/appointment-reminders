import type { Config } from './config.js';


export class SlotTakenError extends Error {}

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'reschedule_requested' | 'cancelled';

export interface Appointment {
  id: string;
  name: string;
  service: string;
  phone: string;
  startsAt: string;
  status: AppointmentStatus;
  reminderLeadMinutes: number | null;
  reminderMessageId: string | null;
  reminderStatus: string | null;
  reminderChannel: string | null;
  confirmationMessageId: string | null;
  confirmationStatus: string | null;
  confirmationChannel: string | null;
  lastReply: string | null;
  lastReplyAt: string | null;
  createdAt: string;
}

export interface Row {
  id: string;
  name: string;
  service: string | null;
  phone: string;
  starts_at: string;
  status: AppointmentStatus;
  reminder_lead_minutes: number | null;
  reminder_message_id: string | null;
  reminder_status: string | null;
  reminder_channel: string | null;
  confirmation_message_id: string | null;
  confirmation_status: string | null;
  confirmation_channel: string | null;
  last_reply: string | null;
  last_reply_at: string | null;
  created_at: string;
}

export interface NewAppointment {
  name: string;
  service: string;
  phone: string;
  startsAt: string;
  reminderLeadMinutes: number;
}

export interface Store {
  create(input: NewAppointment): Promise<Appointment>;
  get(id: string): Promise<Appointment | undefined>;
  list(): Promise<Appointment[]>;
  takenStarts(excludeId?: string): Promise<Set<string>>;
  findUpcomingByPhone(phone: string, now: Date): Promise<Appointment | undefined>;
  findActive(phone: string, startsAt: string): Promise<Appointment | undefined>;
  countUpcomingByPhone(phone: string, now: Date): Promise<number>;
  setReminder(id: string, messageId: string): Promise<void>;
  setConfirmation(id: string, messageId: string): Promise<void>;
  reschedule(id: string, startsAt: string, reminderLeadMinutes: number): Promise<void>;
  delete(id: string): Promise<void>;
  setStatus(id: string, status: AppointmentStatus): Promise<void>;
  setLastReply(id: string, text: string, at: Date): Promise<void>;
  setMessageStatus(messageId: string, status: string, channel?: string): Promise<void>;
  claimEvent(eventId: string): Promise<boolean>;
  releaseEvent(eventId: string): Promise<void>;
  close(): Promise<void>;
}

export const EVENT_RETENTION_MS = 30 * 24 * 60 * 60_000;

export const isUniqueViolation = (err: unknown) =>
  err instanceof Error && (err.message.includes('UNIQUE') || (err as { code?: string }).code === '23505');

export const toAppointment = (row: Row): Appointment => ({
  id: row.id,
  name: row.name,
  service: row.service ?? 'Appointment',
  phone: row.phone,
  startsAt: row.starts_at,
  status: row.status,
  reminderLeadMinutes: row.reminder_lead_minutes,
  reminderMessageId: row.reminder_message_id,
  reminderStatus: row.reminder_status,
  reminderChannel: row.reminder_channel,
  confirmationMessageId: row.confirmation_message_id,
  confirmationStatus: row.confirmation_status,
  confirmationChannel: row.confirmation_channel,
  lastReply: row.last_reply,
  lastReplyAt: row.last_reply_at,
  createdAt: row.created_at,
});

export async function openStore(config: Pick<Config, 'databaseUrl' | 'databasePath'>): Promise<Store> {
  if (config.databaseUrl) {
    const { PostgresStore } = await import('./postgres-store.js');
    return PostgresStore.connect(config.databaseUrl);
  }
  const { SqliteStore } = await import('./sqlite-store.js');
  return new SqliteStore(config.databasePath);
}
