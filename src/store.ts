import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'reschedule_requested' | 'cancelled';

export interface Appointment {
  id: string;
  name: string;
  service: string;
  phone: string;
  startsAt: string;
  status: AppointmentStatus;
  reminderMessageId: string | null;
  reminderStatus: string | null;
  lastReply: string | null;
  lastReplyAt: string | null;
  confirmationMessageId: string | null;
  confirmationStatus: string | null;
  createdAt: string;
}

interface Row {
  id: string;
  name: string;
  service: string | null;
  phone: string;
  starts_at: string;
  status: AppointmentStatus;
  reminder_message_id: string | null;
  reminder_status: string | null;
  last_reply: string | null;
  last_reply_at: string | null;
  confirmation_message_id: string | null;
  confirmation_status: string | null;
  created_at: string;
}

const toAppointment = (row: Row): Appointment => ({
  id: row.id,
  name: row.name,
  service: row.service ?? 'Appointment',
  phone: row.phone,
  startsAt: row.starts_at,
  status: row.status,
  reminderMessageId: row.reminder_message_id,
  reminderStatus: row.reminder_status,
  lastReply: row.last_reply,
  lastReplyAt: row.last_reply_at,
  confirmationMessageId: row.confirmation_message_id,
  confirmationStatus: row.confirmation_status,
  createdAt: row.created_at,
});

export class Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        service TEXT,
        phone TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        status TEXT NOT NULL,
        reminder_message_id TEXT,
        reminder_status TEXT,
        last_reply TEXT,
        last_reply_at TEXT,
        confirmation_message_id TEXT,
        confirmation_status TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS appointments_phone ON appointments (phone);
      CREATE INDEX IF NOT EXISTS appointments_reminder ON appointments (reminder_message_id);
      CREATE TABLE IF NOT EXISTS seen_events (id TEXT PRIMARY KEY);
    `);
    const columns = (this.db.prepare('PRAGMA table_info(appointments)').all() as unknown as { name: string }[]).map((c) => c.name);
    for (const column of ['service', 'last_reply', 'last_reply_at', 'confirmation_message_id', 'confirmation_status']) {
      if (!columns.includes(column)) {
        this.db.exec(`ALTER TABLE appointments ADD COLUMN ${column} TEXT`);
      }
    }
  }

  create(input: { name: string; service: string; phone: string; startsAt: string }): Appointment {
    const appointment: Appointment = {
      id: randomUUID(),
      ...input,
      status: 'scheduled',
      reminderMessageId: null,
      reminderStatus: null,
      lastReply: null,
      lastReplyAt: null,
      confirmationMessageId: null,
      confirmationStatus: null,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare('INSERT INTO appointments (id, name, service, phone, starts_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(appointment.id, appointment.name, appointment.service, appointment.phone, appointment.startsAt, appointment.status, appointment.createdAt);
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

  takenStarts(): Set<string> {
    const rows = this.db.prepare("SELECT starts_at FROM appointments WHERE status != 'cancelled'").all() as unknown as { starts_at: string }[];
    return new Set(rows.map((r) => r.starts_at));
  }

  findUpcomingByPhone(phone: string, now: Date): Appointment | undefined {
    const rows = this.db
      .prepare("SELECT * FROM appointments WHERE phone = ? AND status != 'cancelled' ORDER BY starts_at ASC")
      .all(phone) as unknown as Row[];
    return rows.map(toAppointment).find((a) => new Date(a.startsAt) > now);
  }

  setReminder(id: string, messageId: string): void {
    this.db.prepare("UPDATE appointments SET reminder_message_id = ?, reminder_status = 'queued' WHERE id = ?").run(messageId, id);
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

  setConfirmation(id: string, messageId: string): void {
    this.db.prepare("UPDATE appointments SET confirmation_message_id = ?, confirmation_status = 'queued' WHERE id = ?").run(messageId, id);
  }

  setMessageStatus(messageId: string, status: string): void {
    this.db.prepare('UPDATE appointments SET reminder_status = ? WHERE reminder_message_id = ?').run(status, messageId);
    this.db.prepare('UPDATE appointments SET confirmation_status = ? WHERE confirmation_message_id = ?').run(status, messageId);
  }

  markEventSeen(eventId: string): boolean {
    const result = this.db.prepare('INSERT OR IGNORE INTO seen_events (id) VALUES (?)').run(eventId);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
