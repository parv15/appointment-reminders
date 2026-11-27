import { BOOKED_TITLES, fullWhen, isDelivered, isFailed, reminderTime } from '@/lib/client/booking';
import { duration } from '@/lib/client/format';
import { describePhone } from '@/lib/client/phone';
import type { AppConfig, PublicBooking } from '@/lib/client/types';
import { RollButton } from './Roll';

interface Props {
  config: AppConfig;
  booking: PublicBooking;
  onReset: () => void;
}

export function BookedView({ config, booking, onReset }: Props) {
  const status = booking.alertStatus;
  const failed = isFailed(status);
  const delivered = isDelivered(status);
  const cancelled = booking.status === 'cancelled';
  const { formatted, country } = describePhone(booking.phone);
  const where = country ? `${formatted} (${country})` : formatted;

  const subtitle = cancelled
    ? 'The clinic cancelled this appointment. You can book another time below.'
    : booking.status === 'reschedule_requested'
      ? 'We will contact you soon to find a new time.'
      : !status
        ? 'Your appointment is confirmed.'
        : failed
          ? `We could not text ${where}. Your appointment is still booked.`
          : delivered
            ? `Confirmation texted to ${where}.`
            : `Sending a confirmation text to ${where}.`;

  return (
    <>
      <div className="booked-head">
        <span className={`check${cancelled ? ' off' : ''}`} aria-hidden="true">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5 9-10" />
          </svg>
        </span>
        <div>
          <h2>{BOOKED_TITLES[booking.status] ?? BOOKED_TITLES.scheduled}</h2>
          <p className="muted" role="status" aria-live="polite">
            {subtitle}
          </p>
        </div>
      </div>

      <dl className="details">
        <div>
          <dt>Service</dt>
          <dd>{booking.service}</dd>
        </div>
        <div>
          <dt>Name</dt>
          <dd>{booking.name}</dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>{fullWhen(config.timezone, booking.startsAt)}</dd>
        </div>
        <div>
          <dt>Mobile</dt>
          <dd>
            {formatted}
            {country && <span className="sub-line">{country}</span>}
          </dd>
        </div>
      </dl>
      <p className="alert-error" hidden={!failed}>
        {failed ? `Delivery status: ${status}. Check the number, then book again.` : ''}
      </p>

      <div className="reply-guide" hidden={cancelled || config.repliesPossible === false}>
        <span className="eyebrow">How to reply to our texts</span>
        <ul>
          <li>
            <kbd>C</kbd>
            <span>Confirm you will attend</span>
          </li>
          <li>
            <kbd>R</kbd>
            <span>Ask to reschedule</span>
          </li>
          <li>
            <kbd>STOP</kbd>
            <span>Stop all texts</span>
          </li>
        </ul>
        <p className="muted">
          We will text you a reminder on {reminderTime(config.timezone, booking.startsAt, booking.reminderMinutes)}, {duration(booking.reminderMinutes)} before your appointment.
          {config.repliesPossible === false ? '' : ' You can reply to that message to confirm or to reschedule.'}
        </p>
      </div>

      <RollButton className="btn-primary" text="Book another appointment" onClick={onReset} />
    </>
  );
}
