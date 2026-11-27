import type { AppConfig, AppointmentStatus } from './types';
import { formatter, tidy } from './format';

export const BOOKED_TITLES: Record<AppointmentStatus, string> = {
  scheduled: 'You are booked',
  confirmed: 'You confirmed your appointment',
  reschedule_requested: 'We got your request to reschedule',
  cancelled: 'This appointment was cancelled',
};

export const fullWhen = (timezone: string, iso: string) => tidy(formatter(timezone, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(iso)));
export const dateOnly = (timezone: string, iso: string) => tidy(formatter(timezone, { dateStyle: 'medium' }).format(new Date(iso)));
export const timeOnly = (timezone: string, iso: string) => tidy(formatter(timezone, { timeStyle: 'short' }).format(new Date(iso)));
export const shortWhen = (timezone: string, iso: string) =>
  tidy(formatter(timezone, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)));

export const reminderTime = (timezone: string, startsAt: string, lead: number) => shortWhen(timezone, new Date(new Date(startsAt).getTime() - lead * 60_000).toISOString());

export type MessagePart = string | { v: string };

export function confirmationParts(config: AppConfig, name: string, service: string, startsAt: string): MessagePart[] {
  return [
    'Hello ',
    { v: name },
    ',\n\nThank you for booking with ',
    { v: config.businessName },
    '.\n\nYour appointment for ',
    { v: service },
    ' on ',
    { v: dateOnly(config.timezone, startsAt) },
    ' at ',
    { v: timeOnly(config.timezone, startsAt) },
    config.repliesInText ? ' is confirmed.\n\nReply C to confirm you will attend or R to reschedule.' : ' is confirmed.',
  ];
}

export function reminderParts(config: AppConfig, name: string, startsAt: string): MessagePart[] {
  return [
    'Hello ',
    { v: name },
    ',\n\nThis is a reminder about your upcoming appointment with ',
    { v: config.businessName },
    ' on ',
    { v: dateOnly(config.timezone, startsAt) },
    ' at ',
    { v: timeOnly(config.timezone, startsAt) },
    config.repliesInText ? '.\n\nReply C to confirm or R to reschedule.' : '.\n\nWe look forward to seeing you!',
  ];
}

export const isFailed = (status: string | null) => status === 'failed' || status === 'blocked';
export const isDelivered = (status: string | null) => status === 'delivered' || status === 'read';
export const isReminderReached = (status: string | null) => status === 'sent' || status === 'delivered' || status === 'read';

export const whenMedium = (timezone: string, iso: string) => tidy(formatter(timezone, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)));
