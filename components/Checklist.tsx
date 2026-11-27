import { isDelivered, isFailed, isReminderReached, reminderTime } from '@/lib/client/booking';
import type { PublicBooking } from '@/lib/client/types';

type State = 'done' | 'bad' | 'active' | '';

export function Checklist({ booking, timezone }: { booking: PublicBooking | null; timezone: string }) {
  if (!booking) return null;

  const status = booking.alertStatus;
  const failed = isFailed(status);
  const reached = status !== null && ['sent', 'routed', 'delivered', 'read'].includes(status);
  const delivered = isDelivered(status);
  const reminderReached = isReminderReached(booking.reminderStatus);

  const items: [string, State][] = [
    ['Time slot reserved', 'done'],
    [`Reminder scheduled for ${reminderTime(timezone, booking.startsAt, booking.reminderMinutes)}`, 'done'],
  ];
  if (status) {
    items.push([failed ? 'Confirmation text failed' : reached ? 'Confirmation text sent' : 'Confirmation text is queued', failed ? 'bad' : reached ? 'done' : 'active']);
    items.push([delivered ? 'Confirmation text delivered' : 'Waiting for delivery', failed ? 'bad' : delivered ? 'done' : 'active']);
  }
  items.push([reminderReached ? 'Reminder text delivered' : 'Reminder text not due yet', reminderReached ? 'done' : '']);

  return (
    <div className="checks" id="checks">
      <ul id="check-list">
        {items.map(([text, state]) => (
          <li key={text} className={state || undefined}>
            <span className="box">{state === 'done' ? '\u2713' : state === 'bad' ? '\u00d7' : ''}</span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
