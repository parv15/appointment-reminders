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

export function isRealDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function upcomingDays(now: Date, timeZone: string, count: number): string[] {
  const first = localDate(now, timeZone);
  return Array.from({ length: count }, (_, i) => addDays(first, i));
}

function localClock(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}

export interface SlotRules {
  timezone: string;
  startHour: number;
  endHour: number;
  slotMinutes: number;
  maxAdvanceDays: number;
  minNoticeMinutes: number;
}

export function availableSlots(date: string, rules: SlotRules, taken: Set<string>, now: Date): Date[] {
  if (!isRealDate(date)) return [];
  const today = localDate(now, rules.timezone);
  const last = addDays(today, rules.maxAdvanceDays);
  if (date < today || date > last) return [];

  const slots: Date[] = [];
  for (let minutes = rules.startHour * 60; minutes + rules.slotMinutes <= rules.endHour * 60; minutes += rules.slotMinutes) {
    const hour = Math.floor(minutes / 60);
    const slot = zonedTime(date, hour, minutes % 60, rules.timezone);
    const wanted = `${String(hour).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    if (localDate(slot, rules.timezone) !== date || localClock(slot, rules.timezone) !== wanted) continue;
    if (slot.getTime() > now.getTime() + rules.minNoticeMinutes * 60_000 && !taken.has(slot.toISOString())) {
      slots.push(slot);
    }
  }
  return slots;
}
