export type ReplyIntent = 'confirm' | 'reschedule' | 'compliance' | 'unknown';

const COMPLIANCE_KEYWORDS = new Set([
  'stop', 'cancel', 'unsubscribe', 'quit', 'end', 'start', 'unstop', 'subscribe', 'help', 'info',
]);

const CONFIRM = new Set(['c', 'confirm', 'confirmed']);
const RESCHEDULE = new Set(['r', 'reschedule']);

export function classifyReply(text: string | null | undefined): ReplyIntent {
  const normalized = (text ?? '').trim().toLowerCase();
  if (COMPLIANCE_KEYWORDS.has(normalized)) return 'compliance';
  if (CONFIRM.has(normalized)) return 'confirm';
  if (RESCHEDULE.has(normalized)) return 'reschedule';
  return 'unknown';
}
