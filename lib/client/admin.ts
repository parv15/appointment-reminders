import type { Appointment } from './types';

export type Filter = 'all' | 'scheduled' | 'confirmed' | 'attention' | 'past' | 'cancelled';

export const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'scheduled', label: 'Upcoming' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'past', label: 'Past' },
  { key: 'cancelled', label: 'Cancelled' },
];

export const isPast = (a: Appointment): boolean => new Date(a.startsAt).getTime() <= Date.now();
export const isFuture = (a: Appointment): boolean => a.status !== 'cancelled' && !isPast(a);

export function matchesFilter(a: Appointment, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'attention') return Boolean(a.attention);
  if (filter === 'past') return a.status !== 'cancelled' && isPast(a);
  if (filter === 'scheduled') return isFuture(a) && a.status === 'scheduled' && !a.attention;
  if (filter === 'confirmed') return isFuture(a) && a.status === 'confirmed';
  return a.status === filter;
}

const group = (a: Appointment) => (a.status === 'cancelled' ? 2 : isPast(a) ? 1 : 0);

export function visibleRows(appointments: Appointment[], filter: Filter): Appointment[] {
  return appointments
    .filter((a) => matchesFilter(a, filter))
    .sort((a, b) => group(a) - group(b) || (group(a) === 0 ? -1 : 1) * (new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()));
}

export function stats(appointments: Appointment[]) {
  const future = appointments.filter(isFuture);
  return {
    upcoming: future.filter((a) => a.status === 'scheduled' && !a.attention).length,
    confirmed: future.filter((a) => a.status === 'confirmed').length,
    attention: appointments.filter((a) => a.attention).length,
    cancelled: appointments.filter((a) => a.status === 'cancelled').length,
  };
}
