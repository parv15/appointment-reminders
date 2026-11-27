import { statusTone } from '@/lib/client/format';

export function Pill({ text, status, className = '' }: { text: string; status?: string | null; className?: string }) {
  return <span className={`pill ${statusTone(status)} ${className}`.trim()}>{text}</span>;
}
