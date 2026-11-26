import type { Appointment } from './store.js';

export type Attention = 'reschedule' | 'no_reply' | null;

const REMINDER_REACHED = new Set(['sent', 'delivered', 'read']);

export function attentionFor(appointment: Appointment, now: Date, warningHours: number): Attention {
  if (appointment.status === 'reschedule_requested') return 'reschedule';
  if (appointment.status !== 'scheduled') return null;

  const msUntilStart = new Date(appointment.startsAt).getTime() - now.getTime();
  const reminderReached = REMINDER_REACHED.has(appointment.reminderStatus ?? '');
  return reminderReached && msUntilStart > 0 && msUntilStart <= warningHours * 3_600_000 ? 'no_reply' : null;
}
