import type { Appointment } from './store.js';

export interface ActivityItem {
  at: string;
  kind: 'booked' | 'alert' | 'reminder' | 'reply';
  appointmentId: string;
  name: string;
  phone: string;
  service: string;
  startsAt: string;
  status?: string;
  detail?: string;
}

export function buildActivity(appointments: Appointment[], reminderLeadMinutes: number, now = new Date(), limit = 60): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const a of appointments) {
    const base = { appointmentId: a.id, name: a.name, phone: a.phone, service: a.service, startsAt: a.startsAt };
    items.push({ ...base, at: a.createdAt, kind: 'booked' });

    if (a.confirmationMessageId) {
      items.push({ ...base, at: a.createdAt, kind: 'alert', status: a.confirmationStatus ?? 'queued' });
    }
    if (a.reminderMessageId) {
      const releaseAt = new Date(new Date(a.startsAt).getTime() - reminderLeadMinutes * 60_000);
      const released = releaseAt <= now && releaseAt > new Date(a.createdAt);
      items.push({
        ...base,
        at: released ? releaseAt.toISOString() : a.createdAt,
        kind: 'reminder',
        status: a.reminderStatus ?? 'queued',
        detail: releaseAt.toISOString(),
      });
    }
    if (a.lastReply && a.lastReplyAt) {
      items.push({ ...base, at: a.lastReplyAt, kind: 'reply', detail: a.lastReply });
    }
  }

  return items.sort((x, y) => y.at.localeCompare(x.at)).slice(0, limit);
}
