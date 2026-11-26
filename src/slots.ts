function offsetMs(utc: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utc));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(utc / 1000) * 1000;
}

export function zonedTime(date: string, hour: number, minute: number, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(guess, timeZone);
  return new Date(guess - offsetMs(first, timeZone));
}

export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

export interface SlotRules {
  timezone: string;
  startHour: number;
  endHour: number;
  slotMinutes: number;
  maxAdvanceDays: number;
}

export function availableSlots(date: string, rules: SlotRules, taken: Set<string>, now: Date): Date[] {
  const today = localDate(now, rules.timezone);
  const last = localDate(new Date(now.getTime() + rules.maxAdvanceDays * 86_400_000), rules.timezone);
  if (date < today || date > last) return [];

  const slots: Date[] = [];
  for (let minutes = rules.startHour * 60; minutes + rules.slotMinutes <= rules.endHour * 60; minutes += rules.slotMinutes) {
    const slot = zonedTime(date, Math.floor(minutes / 60), minutes % 60, rules.timezone);
    if (slot.getTime() > now.getTime() + 60 * 60_000 && !taken.has(slot.toISOString())) {
      slots.push(slot);
    }
  }
  return slots;
}
