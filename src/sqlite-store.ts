import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { type Appointment, type AppointmentStatus, EVENT_RETENTION_MS, type NewAppointment, type Row, SlotTakenError, type Store, isUniqueViolation, toAppointment } from './store';

const COLUMNS: Record<string, string> = {
  service: 'TEXT',
  last_reply: 'TEXT',
  last_reply_at: 'TEXT',
  confirmation_message_id: 'TEXT',
  confirmation_status: 'TEXT',
  reminder_lead_minutes: 'INTEGER',
  reminder_channel: 'TEXT',
  reminder_reason: 'TEXT',
  confirmation_reason: 'TEXT',
  confirmation_channel: 'TEXT',
};

export class SqliteStore implements Store {
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
      this.db
        .prepare('INSERT INTO appointments (id, name, service, phone, starts_at, status, reminder_lead_minutes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(appointment.id, appointment.name, appointment.service, appointment.phone, appointment.startsAt, appointment.status, appointment.reminderLeadMinutes, appointment.createdAt);
    } catch (err) {
      throw isUniqueViolation(err) ? new SlotTakenError() : err;
    }
    return appointment;
  }

  async get(id: string): Promise<Appointment | undefined> {
    const row = this.db.prepare('SELECT * FROM appointments WHERE id = ?').get(id) as Row | undefined;
    return row && toAppointment(row);
  }

  async list(): Promise<Appointment[]> {
    const rows = this.db.prepare('SELECT * FROM appointments ORDER BY starts_at ASC').all() as unknown as Row[];
    return rows.map(toAppointment);
  }

  async takenStarts(excludeId?: string): Promise<Set<string>> {
    const rows = this.db
      .prepare("SELECT starts_at FROM appointments WHERE status != 'cancelled' AND id != ?")
      .all(excludeId ?? '') as unknown as { starts_at: string }[];
    return new Set(rows.map((r) => r.starts_at));
  }

  async findUpcomingByPhone(phone: string, now: Date): Promise<Appointment | undefined> {
    const rows = this.db
      .prepare("SELECT * FROM appointments WHERE phone = ? AND status != 'cancelled' ORDER BY starts_at ASC")
      .all(phone) as unknown as Row[];
    return rows.map(toAppointment).find((a) => new Date(a.startsAt) > now);
  }

  async findActive(phone: string, startsAt: string): Promise<Appointment | undefined> {
    const row = this.db.prepare("SELECT * FROM appointments WHERE phone = ? AND starts_at = ? AND status != 'cancelled'").get(phone, startsAt) as Row | undefined;
    return row && toAppointment(row);
  }

  async countUpcomingByPhone(phone: string, now: Date): Promise<number> {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM appointments WHERE phone = ? AND status != 'cancelled' AND starts_at > ?")
      .get(phone, now.toISOString()) as unknown as { n: number };
    return row.n;
  }

  async setReminder(id: string, messageId: string): Promise<void> {
    this.db
      .prepare("UPDATE appointments SET reminder_message_id = ?, reminder_status = 'queued', reminder_channel = NULL WHERE id = ?")
      .run(messageId, id);
  }

  async setConfirmation(id: string, messageId: string): Promise<void> {
    this.db.prepare("UPDATE appointments SET confirmation_message_id = ?, confirmation_status = 'queued' WHERE id = ?").run(messageId, id);
  }

  async reschedule(id: string, startsAt: string, reminderLeadMinutes: number): Promise<void> {
    try {
      this.db
        .prepare("UPDATE appointments SET starts_at = ?, reminder_lead_minutes = ?, status = 'scheduled', last_reply = NULL, last_reply_at = NULL WHERE id = ?")
        .run(startsAt, reminderLeadMinutes, id);
    } catch (err) {
      throw isUniqueViolation(err) ? new SlotTakenError() : err;
    }
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM appointments WHERE id = ?').run(id);
  }

  async setStatus(id: string, status: AppointmentStatus): Promise<void> {
    this.db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(status, id);
  }

  async setLastReply(id: string, text: string, at: Date): Promise<void> {
    this.db.prepare('UPDATE appointments SET last_reply = ?, last_reply_at = ? WHERE id = ?').run(text.slice(0, 200), at.toISOString(), id);
  }

  async setMessageStatus(messageId: string, status: string, channel?: string, reason?: string): Promise<void> {
    this.db
      .prepare('UPDATE appointments SET reminder_status = ?, reminder_channel = COALESCE(?, reminder_channel), reminder_reason = COALESCE(?, reminder_reason) WHERE reminder_message_id = ?')
      .run(status, channel ?? null, reason ?? null, messageId);
    this.db
      .prepare('UPDATE appointments SET confirmation_status = ?, confirmation_channel = COALESCE(?, confirmation_channel), confirmation_reason = COALESCE(?, confirmation_reason) WHERE confirmation_message_id = ?')
      .run(status, channel ?? null, reason ?? null, messageId);
  }

  async claimEvent(eventId: string): Promise<boolean> {
    const result = this.db.prepare('INSERT OR IGNORE INTO seen_events (id, seen_at) VALUES (?, ?)').run(eventId, new Date().toISOString());
    return result.changes > 0;
  }

  async releaseEvent(eventId: string): Promise<void> {
    this.db.prepare('DELETE FROM seen_events WHERE id = ?').run(eventId);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
