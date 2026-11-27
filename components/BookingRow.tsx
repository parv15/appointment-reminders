import { useState } from 'react';
import { isFuture, isPast } from '@/lib/client/admin';
import { whenMedium } from '@/lib/client/booking';
import { cssVars } from '@/lib/client/css';
import { ago, channelName, label, until } from '@/lib/client/format';
import { describePhone } from '@/lib/client/phone';
import type { AppConfig, Appointment } from '@/lib/client/types';
import { Avatar } from './Avatar';
import { Pill } from './Pill';

const SEPARATOR = '\u00a0\u00b7 ';

interface Props {
  appointment: Appointment;
  config: AppConfig;
  index: number;
  isNew: boolean;
  onReschedule: (appointment: Appointment) => void;
  onCancel: (appointment: Appointment) => Promise<boolean>;
}

function ReminderPill({ a, config }: { a: Appointment; config: AppConfig }) {
  if (!a.reminderMessageId) return null;
  const status = a.reminderStatus ?? 'queued';
  if (status === 'scheduled') {
    const lead = a.reminderLeadMinutes ?? config.reminderOptions[0] ?? 0;
    const at = new Date(new Date(a.startsAt).getTime() - lead * 60_000).toISOString();
    return <Pill text={`Reminder due ${whenMedium(config.timezone, at)}`} status={status} />;
  }
  const channel = channelName(a.reminderChannel);
  return <Pill text={`Reminder ${label(status)}${channel ? ` via ${channel}` : ''}`} status={status} />;
}

export function BookingRow({ appointment: a, config, index, isNew, onReschedule, onCancel }: Props) {
  const [appear, setAppear] = useState(isNew);
  const [cancelling, setCancelling] = useState(false);
  const { formatted, country } = describePhone(a.phone);
  const confirmationChannel = channelName(a.confirmationChannel);

  const cancel = async () => {
    if (!window.confirm(`Cancel ${a.name}'s appointment? Their scheduled reminder is cancelled too, and they get a text saying so.`)) return;
    setCancelling(true);
    await onCancel(a);
    setCancelling(false);
  };

  return (
    <li className={`row ${a.status}${a.attention ? ` attention ${a.attention}` : ''}${appear ? ' appear' : ''}`} style={cssVars({ '--n': index })} onAnimationEnd={(e) => e.target === e.currentTarget && setAppear(false)}>
      <Avatar name={a.name} />

      <div className="who">
        <strong>
          {a.name}
          <span className="service">{a.service}</span>
        </strong>
        <span className="contact">
          <span className="phone-no">{formatted}</span>
          {country && (
            <>
              <span className="sep">{SEPARATOR}</span>
              <span className="country">{country}</span>
            </>
          )}
          <span className="sep sep-when">{SEPARATOR}</span>
          <span className="when">
            {whenMedium(config.timezone, a.startsAt)} ({until(a.startsAt)})
          </span>
        </span>

        <div className="meta">
          {isPast(a) && a.status !== 'cancelled' ? <Pill text="past" /> : <Pill text={label(a.status)} status={a.status} />}
          {a.attention === 'reschedule' && <Pill text="Asked to reschedule" status="reschedule_requested" />}
          {a.attention === 'no_reply' && <Pill text="No reply yet" status="failed" />}
          {a.confirmationMessageId && (
            <Pill text={`Confirmation ${label(a.confirmationStatus)}${confirmationChannel ? ` via ${confirmationChannel}` : ''}`} status={a.confirmationStatus} />
          )}
          <ReminderPill a={a} config={config} />
          {a.lastReply && <span className="reply">{`Replied "${a.lastReply}"${a.lastReplyAt ? ` ${ago(a.lastReplyAt)}` : ''}`}</span>}
        </div>
      </div>

      <div className="actions">
        {isFuture(a) && (
          <>
            <button type="button" className={`btn btn-sm ${a.attention === 'reschedule' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onReschedule(a)}>
              Reschedule
            </button>
            <button type="button" className="btn btn-sm btn-ghost btn-danger" disabled={cancelling} onClick={cancel}>
              Cancel
            </button>
          </>
        )}
      </div>
    </li>
  );
}
