import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

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

interface Row {
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

const EVENT_RETENTION_MS = 30 * 24 * 60 * 60_000;

const COLUMNS: Record<string, string> = {
  service: 'TEXT',
  last_reply: 'TEXT',
  last_reply_at: 'TEXT',
  confirmation_message_id: 'TEXT',
  confirmation_status: 'TEXT',
  reminder_lead_minutes: 'INTEGER',
  reminder_channel: 'TEXT',
  confirmation_channel: 'TEXT',
};

const toAppointment = (row: Row): Appointment => ({
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

const isUniqueViolation = (err: unknown) => err instanceof Error && err.message.includes('UNIQUE');

export class Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        status TEXT NOT NULL,
        reminder_message_id TEXT,
        reminder_status TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS appointments_phone ON appointments (phone);
      CREATE INDEX IF NOT EXISTS appointments_reminder ON appointments (reminder_message_id);
      CREATE TABLE IF NOT EXISTS seen_events (id TEXT PRIMARY KEY, seen_at TEXT);
    `);

    const existing = (this.db.prepare('PRAGMA table_info(appointments)').all() as unknown as { name: string }[]).map((c) => c.name);
    for (const [column, type] of Object.entries(COLUMNS)) {
      if (!existing.includes(column)) {
        this.db.exec(`ALTER TABLE appointments ADD COLUMN ${column} ${type}`);
      }
    }

    const eventColumns = (this.db.prepare('PRAGMA table_info(seen_events)').all() as unknown as { name: string }[]).map((c) => c.name);
    if (!eventColumns.includes('seen_at')) {
      this.db.exec('ALTER TABLE seen_events ADD COLUMN seen_at TEXT');
    }
    this.db.prepare('DELETE FROM seen_events WHERE seen_at < ?').run(new Date(Date.now() - EVENT_RETENTION_MS).toISOString());

    try {
      this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_slot ON appointments (starts_at) WHERE status != 'cancelled'");
    } catch {
      console.warn('Warning: the database already holds two active appointments at the same time, so the one-booking-per-slot guard is off. Cancel one of them and restart.');
    }
  }

  create(input: { name: string; service: string; phone: string; startsAt: string; reminderLeadMinutes: number }): Appointment {
    const appointment: Appointment = {
      id: randomUUID(),
      ...input,
      status: 'scheduled',
      reminderMessageId: null,
      reminderStatus: null,
      reminderChannel: null,
      confirmationMessageId: null,
      confirmationStatus: null,
      confirmationChannel: null,
      lastReply: null,
      lastReplyAt: null,
      createdAt: new Date().toISOString(),
    };
    try {
      this.db
        .prepare('INSERT INTO appointments (id, name, service, phone, starts_at, status, reminder_lead_minutes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(appointment.id, appointment.name, appointment.service, appointment.phone, appointment.startsAt, appointment.status, appointment.reminderLeadMinutes, appointment.createdAt);
    } catch (err) {
      throw isUniqueViolation(err) ? new SlotTakenError() : err;
    }
    return appointment;
  }

  get(id: string): Appointment | undefined {
    const row = this.db.prepare('SELECT * FROM appointments WHERE id = ?').get(id) as Row | undefined;
    return row && toAppointment(row);
  }

  list(): Appointment[] {
    const rows = this.db.prepare('SELECT * FROM appointments ORDER BY starts_at ASC').all() as unknown as Row[];
    return rows.map(toAppointment);
  }

  takenStarts(excludeId?: string): Set<string> {
    const rows = this.db
      .prepare("SELECT starts_at FROM appointments WHERE status != 'cancelled' AND id != ?")
      .all(excludeId ?? '') as unknown as { starts_at: string }[];
    return new Set(rows.map((r) => r.starts_at));
  }

  findUpcomingByPhone(phone: string, now: Date): Appointment | undefined {
    const rows = this.db
      .prepare("SELECT * FROM appointments WHERE phone = ? AND status != 'cancelled' ORDER BY starts_at ASC")
      .all(phone) as unknown as Row[];
    return rows.map(toAppointment).find((a) => new Date(a.startsAt) > now);
  }

  findActive(phone: string, startsAt: string): Appointment | undefined {
    const row = this.db.prepare("SELECT * FROM appointments WHERE phone = ? AND starts_at = ? AND status != 'cancelled'").get(phone, startsAt) as Row | undefined;
    return row && toAppointment(row);
  }

  countUpcomingByPhone(phone: string, now: Date): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM appointments WHERE phone = ? AND status != 'cancelled' AND starts_at > ?")
      .get(phone, now.toISOString()) as unknown as { n: number };
    return row.n;
  }

  setReminder(id: string, messageId: string): void {
    this.db
      .prepare("UPDATE appointments SET reminder_message_id = ?, reminder_status = 'queued', reminder_channel = NULL WHERE id = ?")
      .run(messageId, id);
  }

  setConfirmation(id: string, messageId: string): void {
    this.db.prepare("UPDATE appointments SET confirmation_message_id = ?, confirmation_status = 'queued' WHERE id = ?").run(messageId, id);
  }

  reschedule(id: string, startsAt: string, reminderLeadMinutes: number): void {
    try {
      this.db
        .prepare("UPDATE appointments SET starts_at = ?, reminder_lead_minutes = ?, status = 'scheduled', last_reply = NULL, last_reply_at = NULL WHERE id = ?")
        .run(startsAt, reminderLeadMinutes, id);
    } catch (err) {
      throw isUniqueViolation(err) ? new SlotTakenError() : err;
    }
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM appointments WHERE id = ?').run(id);
  }

  setStatus(id: string, status: AppointmentStatus): void {
    this.db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(status, id);
  }

  setLastReply(id: string, text: string, at: Date): void {
    this.db.prepare('UPDATE appointments SET last_reply = ?, last_reply_at = ? WHERE id = ?').run(text.slice(0, 200), at.toISOString(), id);
  }

  setMessageStatus(messageId: string, status: string, channel?: string): void {
    this.db
      .prepare('UPDATE appointments SET reminder_status = ?, reminder_channel = COALESCE(?, reminder_channel) WHERE reminder_message_id = ?')
      .run(status, channel ?? null, messageId);
    this.db
      .prepare('UPDATE appointments SET confirmation_status = ?, confirmation_channel = COALESCE(?, confirmation_channel) WHERE confirmation_message_id = ?')
      .run(status, channel ?? null, messageId);
  }

  claimEvent(eventId: string): boolean {
    const result = this.db.prepare('INSERT OR IGNORE INTO seen_events (id, seen_at) VALUES (?, ?)').run(eventId, new Date().toISOString());
    return result.changes > 0;
  }

  releaseEvent(eventId: string): void {
    this.db.prepare('DELETE FROM seen_events WHERE id = ?').run(eventId);
  }

  close(): void {
    this.db.close();
  }
}
