const STATUS_LABELS: Record<string, string> = { processed: 'queued', routed: 'sending' };

export const label = (value: string | null | undefined): string => STATUS_LABELS[value ?? ''] ?? (value ?? 'none').replaceAll('_', ' ');

export type Tone = 'good' | 'warn' | 'bad' | 'info' | '';

export function statusTone(status: string | null | undefined): Tone {
  if (!status) return '';
  if (['confirmed', 'delivered', 'read', 'sent'].includes(status)) return 'good';
  if (status === 'reschedule_requested') return 'warn';
  if (['failed', 'blocked', 'cancelled'].includes(status)) return 'bad';
  if (['queued', 'scheduled', 'processed', 'routed'].includes(status)) return 'info';
  return '';
}

export const formatter = (timeZone: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone, ...options });

export const tidy = (text: string): string => text.replace(/[\u202f\u00a0]/g, ' ');

export function duration(minutes: number): string {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  return [days && `${days} day${days > 1 ? 's' : ''}`, hours && `${hours} hour${hours > 1 ? 's' : ''}`, mins && `${mins} min`].filter(Boolean).join(' ');
}

export function ago(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

export function until(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (minutes < 0) return 'past';
  if (minutes < 60) return `in ${minutes} min`;
  if (minutes < 1440) return `in ${Math.round(minutes / 60)} h`;
  return `in ${Math.round(minutes / 1440)} d`;
}

export const channelName = (channel: string | null | undefined): string | null => (channel ? channel.toUpperCase() : null);

export function listOf(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;
}

export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));
