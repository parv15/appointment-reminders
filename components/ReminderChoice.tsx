import { duration, formatter, tidy } from '@/lib/client/format';
import { reminderFeasible } from '@/lib/client/picker';

interface Props {
  options: number[];
  timezone: string;
  slot: string | null;
  lead: number | null;
  onSelect: (minutes: number) => void;
}

export function ReminderChoice({ options, timezone, slot, lead, onSelect }: Props) {
  const reminderAt = formatter(timezone, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <>
      <div className="chips">
        {options.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className={`chip${lead === minutes ? ' on' : ''}`}
            disabled={slot !== null && !reminderFeasible(slot, minutes)}
            onClick={() => onSelect(minutes)}
          >
            {duration(minutes)} before
          </button>
        ))}
      </div>
      <p className="reminder-preview">
        {!slot ? (
          'Pick a time to see when the reminder is sent.'
        ) : lead ? (
          <>
            The reminder text goes out <b>{tidy(reminderAt.format(new Date(new Date(slot).getTime() - lead * 60_000)))}</b>.
          </>
        ) : (
          'This time is too close for a reminder. Pick a later time.'
        )}
      </p>
    </>
  );
}
