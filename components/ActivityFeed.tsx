import { useState } from 'react';
import { whenMedium } from '@/lib/client/booking';
import { cssVars } from '@/lib/client/css';
import { ago, channelName, label, until } from '@/lib/client/format';
import { describePhone, formatPhone } from '@/lib/client/phone';
import type { ActivityItem, AppConfig } from '@/lib/client/types';
import { Pill } from './Pill';

const ICONS: Record<ActivityItem['kind'], string> = { booked: '+', alert: '!', reminder: 'R', reply: '\u21A9' };

export const feedKey = (item: ActivityItem) => `feed:${item.kind}:${item.appointmentId}:${item.at}`;

function describe(item: ActivityItem, timezone: string): string {
  switch (item.kind) {
    case 'booked':
      return `${item.name} booked ${item.service} for ${whenMedium(timezone, item.startsAt)}`;
    case 'alert':
      return `Confirmation text sent to ${formatPhone(item.phone)}`;
    case 'reminder':
      return item.status === 'scheduled' && item.detail
        ? `Reminder for ${formatPhone(item.phone)} is due ${whenMedium(timezone, item.detail)}`
        : `Reminder sent to ${formatPhone(item.phone)}`;
    case 'reply':
      return `${item.name} replied "${item.detail}"`;
  }
}

const relative = (iso: string) => (new Date(iso).getTime() > Date.now() ? until(iso) : ago(iso));

function FeedItem({ item, config, index, isNew }: { item: ActivityItem; config: AppConfig; index: number; isNew: boolean }) {
  const [appear, setAppear] = useState(isNew);
  const { formatted, country } = describePhone(item.phone);
  const channel = channelName(item.channel);

  return (
    <li className={`feed-item ${item.kind}${appear ? ' appear' : ''}`} style={cssVars({ '--n': index })} onAnimationEnd={(e) => e.target === e.currentTarget && setAppear(false)}>
      <span className="feed-icon">{ICONS[item.kind]}</span>
      <div className="feed-body">
        <span>{describe(item, config.timezone)}</span>
        <small>
          {relative(item.at)}
          <span>{country ? `${formatted} \u00b7 ${country}` : formatted}</span>
          {item.status && <Pill text={label(item.status)} status={item.status} />}
          {channel && <span>{channel}</span>}
        </small>
      </div>
    </li>
  );
}

interface Props {
  items: ActivityItem[];
  config: AppConfig;
  fresh: ReadonlySet<string>;
}

export function ActivityFeed({ items, config, fresh }: Props) {
  return (
    <div className="feed-card rise" style={cssVars({ '--d': 5 })}>
      <div className="section-title">
        <h2>Alerts and activity</h2>
      </div>
      <ul className="feed">
        {items.map((item, n) => (
          <FeedItem key={feedKey(item)} item={item} config={config} index={n} isNew={fresh.has(feedKey(item))} />
        ))}
      </ul>
      <p className="muted" hidden={items.length > 0}>
        Nothing yet.
      </p>
    </div>
  );
}
