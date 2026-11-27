import type { Appointment } from './store';

export type Attention = 'reschedule' | 'no_reply' | null;

const REMINDER_REACHED = new Set(['sent', 'delivered', 'read']);

export function attentionFor(appointment: Appointment, now: Date, warningHours: number): Attention {
  const msUntilStart = new Date(appointment.startsAt).getTime() - now.getTime();
  if (msUntilStart <= 0) return null;
  if (appointment.status === 'reschedule_requested') return 'reschedule';
  if (appointment.status !== 'scheduled') return null;

  const reminderReached = REMINDER_REACHED.has(appointment.reminderStatus ?? '');
  return reminderReached && msUntilStart <= warningHours * 3_600_000 ? 'no_reply' : null;
}
