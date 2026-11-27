import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  type Appointment,
  type AppointmentStatus,
  EVENT_RETENTION_MS,
  type NewAppointment,
  type Row,
  SlotTakenError,
  type Store,
  isUniqueViolation,
  toAppointment,
} from './store';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    service TEXT,
    phone TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    status TEXT NOT NULL,
    reminder_lead_minutes INTEGER,
    reminder_message_id TEXT,
    reminder_status TEXT,
    reminder_channel TEXT,
    reminder_reason TEXT,
    confirmation_message_id TEXT,
    confirmation_status TEXT,
    confirmation_channel TEXT,
    confirmation_reason TEXT,
    last_reply TEXT,
    last_reply_at TEXT,
    created_at TEXT NOT NULL
  );
  ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_reason TEXT;
  ALTER TABLE appointments ADD COLUMN IF NOT EXISTS confirmation_reason TEXT;
  CREATE INDEX IF NOT EXISTS appointments_phone ON appointments (phone);
  CREATE INDEX IF NOT EXISTS appointments_reminder ON appointments (reminder_message_id);
  CREATE INDEX IF NOT EXISTS appointments_confirmation ON appointments (confirmation_message_id);
  CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_slot ON appointments (starts_at) WHERE status <> 'cancelled';
  CREATE TABLE IF NOT EXISTS seen_events (id TEXT PRIMARY KEY, seen_at TEXT);
`;

export class PostgresStore implements Store {
  private constructor(private readonly pool: pg.Pool) {}

  static async connect(url: string): Promise<PostgresStore> {
    const plain = /sslmode=disable/.test(url) || /@(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)[:/]/.test(url);
    const pool = new pg.Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      ...(plain ? {} : { ssl: { rejectUnauthorized: false } }),
    });
    const store = new PostgresStore(pool);
    await pool.query(SCHEMA);
    await pool.query('DELETE FROM seen_events WHERE seen_at < $1', [new Date(Date.now() - EVENT_RETENTION_MS).toISOString()]);
    return store;
  }

  async create(input: NewAppointment): Promise<Appointment> {
    const appointment: Appointment = {
      id: randomUUID(),
      ...input,
      status: 'scheduled',
      reminderMessageId: null,
      reminderStatus: null,
      reminderChannel: null,
      reminderReason: null,
      confirmationMessageId: null,
      confirmationStatus: null,
      confirmationChannel: null,
      confirmationReason: null,
      lastReply: null,
      lastReplyAt: null,
      createdAt: new Date().toISOString(),
    };
    try {
      await this.pool.query(
        'INSERT INTO appointments (id, name, service, phone, starts_at, status, reminder_lead_minutes, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [appointment.id, appointment.name, appointment.service, appointment.phone, appointment.startsAt, appointment.status, appointment.reminderLeadMinutes, appointment.createdAt],
      );
    } catch (err) {
      throw isUniqueViolation(err) ? new SlotTakenError() : err;
    }
    return appointment;
  }

  private async one(text: string, params: unknown[]): Promise<Appointment | undefined> {
    const { rows } = await this.pool.query<Row>(text, params);
    return rows[0] && toAppointment(rows[0]);
  }

  get(id: string) {
    return this.one('SELECT * FROM appointments WHERE id = $1', [id]);
  }

  async list(): Promise<Appointment[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM appointments ORDER BY starts_at ASC');
    return rows.map(toAppointment);
  }

  async takenStarts(excludeId?: string): Promise<Set<string>> {
    const { rows } = await this.pool.query<{ starts_at: string }>("SELECT starts_at FROM appointments WHERE status <> 'cancelled' AND id <> $1", [excludeId ?? '']);
    return new Set(rows.map((r) => r.starts_at));
  }

  findUpcomingByPhone(phone: string, now: Date) {
    return this.one("SELECT * FROM appointments WHERE phone = $1 AND status <> 'cancelled' AND starts_at > $2 ORDER BY starts_at ASC LIMIT 1", [phone, now.toISOString()]);
  }

  findActive(phone: string, startsAt: string) {
    return this.one("SELECT * FROM appointments WHERE phone = $1 AND starts_at = $2 AND status <> 'cancelled'", [phone, startsAt]);
  }

  async countUpcomingByPhone(phone: string, now: Date): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>("SELECT COUNT(*) AS n FROM appointments WHERE phone = $1 AND status <> 'cancelled' AND starts_at > $2", [phone, now.toISOString()]);
    return Number(rows[0]?.n ?? 0);
  }

  async setReminder(id: string, messageId: string): Promise<void> {
    await this.pool.query("UPDATE appointments SET reminder_message_id = $1, reminder_status = 'queued', reminder_channel = NULL WHERE id = $2", [messageId, id]);
  }

  async setConfirmation(id: string, messageId: string): Promise<void> {
    await this.pool.query("UPDATE appointments SET confirmation_message_id = $1, confirmation_status = 'queued' WHERE id = $2", [messageId, id]);
  }

  async reschedule(id: string, startsAt: string, reminderLeadMinutes: number): Promise<void> {
    try {
      await this.pool.query("UPDATE appointments SET starts_at = $1, reminder_lead_minutes = $2, status = 'scheduled', last_reply = NULL, last_reply_at = NULL WHERE id = $3", [startsAt, reminderLeadMinutes, id]);
    } catch (err) {
      throw isUniqueViolation(err) ? new SlotTakenError() : err;
    }
  }

  async delete(id: string): Promise<void> {
    await this.pool.query('DELETE FROM appointments WHERE id = $1', [id]);
  }

  async setStatus(id: string, status: AppointmentStatus): Promise<void> {
    await this.pool.query('UPDATE appointments SET status = $1 WHERE id = $2', [status, id]);
  }

  async setLastReply(id: string, text: string, at: Date): Promise<void> {
    await this.pool.query('UPDATE appointments SET last_reply = $1, last_reply_at = $2 WHERE id = $3', [text.slice(0, 200), at.toISOString(), id]);
  }

  async setMessageStatus(messageId: string, status: string, channel?: string, reason?: string): Promise<void> {
    await this.pool.query('UPDATE appointments SET reminder_status = $1, reminder_channel = COALESCE($2, reminder_channel), reminder_reason = COALESCE($3, reminder_reason) WHERE reminder_message_id = $4', [status, channel ?? null, reason ?? null, messageId]);
    await this.pool.query('UPDATE appointments SET confirmation_status = $1, confirmation_channel = COALESCE($2, confirmation_channel), confirmation_reason = COALESCE($3, confirmation_reason) WHERE confirmation_message_id = $4', [status, channel ?? null, reason ?? null, messageId]);
  }

  async claimEvent(eventId: string): Promise<boolean> {
    const result = await this.pool.query('INSERT INTO seen_events (id, seen_at) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [eventId, new Date().toISOString()]);
    return (result.rowCount ?? 0) > 0;
  }

  async releaseEvent(eventId: string): Promise<void> {
    await this.pool.query('DELETE FROM seen_events WHERE id = $1', [eventId]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
