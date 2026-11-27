import { confirmationParts, isReminderReached, type MessagePart, reminderParts, reminderTime } from '@/lib/client/booking';
import { label } from '@/lib/client/format';
import type { AppConfig, PickerValue, PublicBooking } from '@/lib/client/types';

function Bubble({ parts, footer, ghost = false }: { parts: MessagePart[]; footer?: string; ghost?: boolean }) {
  return (
    <div className={`bubble${ghost ? ' ghost' : ''}`}>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          part
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed template with repeated variables
          <span key={i} className="var">
            {part.v}
          </span>
        ),
      )}
      {footer && <small>{footer}</small>}
    </div>
  );
}

interface Props {
  config: AppConfig | null;
  booking: PublicBooking | null;
  selection: PickerValue | null;
  typedName: string;
}

export function MessagePreview({ config, booking, selection, typedName }: Props) {
  const source = booking ?? selection;

  return (
    <div className="phone">
      <div className="phone-top" id="phone-title">
        {config?.businessName ?? 'Messages'}
      </div>
      <div className="thread" id="thread">
        {config && !source && <Bubble parts={['Pick a time to preview the texts you will get.']} ghost />}
        {config && source && <Texts config={config} booking={booking} source={source} typedName={typedName} lead={booking?.reminderMinutes ?? selection?.reminderMinutes ?? 0} />}
      </div>
    </div>
  );
}

function Texts({
  config,
  booking,
  source,
  typedName,
  lead,
}: {
  config: AppConfig;
  booking: PublicBooking | null;
  source: { service: string; startsAt: string };
  typedName: string;
  lead: number;
}) {
  const name = booking?.name ?? (typedName.trim() || 'Your name');
  const status = booking?.alertStatus ?? null;
  const channel = booking?.alertChannel ? ` via ${booking.alertChannel.toUpperCase()}` : '';
  const reminderReached = isReminderReached(booking?.reminderStatus ?? null);

  return (
    <>
      <Bubble parts={confirmationParts(config, name, source.service, source.startsAt)} footer={booking ? (status ? `${label(status)}${channel}` : 'Sent') : 'Sent right away'} />
      <Bubble
        parts={reminderParts(config, name, source.startsAt)}
        footer={reminderReached ? `Delivered${channel}` : `Due ${reminderTime(config.timezone, source.startsAt, lead)}`}
        ghost={!reminderReached}
      />
    </>
  );
}
