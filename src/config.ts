import type { SlotRules } from './slots';

export interface Config {
  port: number;
  webhookSecret: string;
  templateName: string;
  confirmationTemplateName: string;
  rescheduleTemplateName: string;
  cancellationTemplateName: string;
  businessName: string;
  services: string[];
  defaultCountryCode: string;
  adminPassword: string;
  slotRules: SlotRules;
  reminderOptions: number[];
  noReplyWarningHours: number;
  timezone: string;
  sandbox: boolean;
  databasePath: string;
  databaseUrl: string;
  trustProxy: boolean | number | string;
  bookingsPerHourPerIp: number;
}

const MAX_NAME_LENGTH = 40;

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
  }
}

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const problems: string[] = [];

  const required = (name: string, hint: string) => {
    const value = env[name]?.trim() ?? '';
    if (!value) {
      problems.push(`${name} is not set. ${hint}`);
    }
    return value;
  };

  required('SENT_DM_API_KEY', 'Create a key at https://app.sent.dm/dashboard/api-keys');
  const webhookSecret = env.SENT_DM_WEBHOOK_SECRET?.trim() ?? '';
  const businessName = required('BUSINESS_NAME', 'It appears in the reminder text, for example "Maple Street Dental"');

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push(`PORT must be a number between 1 and 65535, got "${env.PORT}"`);
  }

  const reminderOptions = [...new Set((env.REMINDER_OPTIONS ?? '1440,120,60').split(',').map((v) => Number(v.trim())))].sort((a, b) => b - a);
  if (reminderOptions.some((m) => !Number.isInteger(m) || m < 5 || m > 20_000)) {
    problems.push(`REMINDER_OPTIONS must be whole minutes between 5 and 20000, separated by commas, got "${env.REMINDER_OPTIONS}"`);
  }

  const noReplyWarningHours = Number(env.NO_REPLY_WARNING_HOURS ?? 3);
  if (!Number.isFinite(noReplyWarningHours) || noReplyWarningHours <= 0) {
    problems.push(`NO_REPLY_WARNING_HOURS must be a positive number, got "${env.NO_REPLY_WARNING_HOURS}"`);
  }

  const timezone = env.BUSINESS_TIMEZONE ?? 'UTC';
  if (!validTimezone(timezone)) {
    problems.push(`BUSINESS_TIMEZONE "${timezone}" is not a valid IANA timezone, for example America/New_York`);
  }

  const startHour = Number(env.BOOKING_START_HOUR ?? 9);
  const endHour = Number(env.BOOKING_END_HOUR ?? 17);
  const slotMinutes = Number(env.SLOT_MINUTES ?? 30);
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || endHour > 24 || startHour >= endHour) {
    problems.push('BOOKING_START_HOUR and BOOKING_END_HOUR must be whole hours with the start before the end, for example 9 and 17');
  }
  if (![10, 15, 20, 30, 45, 60].includes(slotMinutes)) {
    problems.push(`SLOT_MINUTES must be one of 10, 15, 20, 30, 45, 60, got "${env.SLOT_MINUTES}"`);
  }

  const services = [...new Set((env.SERVICES ?? 'Appointment').split(',').map((s) => s.trim()).filter(Boolean))];
  if (services.length === 0) {
    problems.push('SERVICES must list at least one service, for example "Dental checkup,Teeth cleaning"');
  }
  const tooLong = services.filter((s) => s.length > MAX_NAME_LENGTH);
  if (tooLong.length > 0) {
    problems.push(`Each service name must be ${MAX_NAME_LENGTH} characters or fewer, so shorten: ${tooLong.join(', ')}`);
  }
  if (businessName.length > MAX_NAME_LENGTH) {
    problems.push(`BUSINESS_NAME must be ${MAX_NAME_LENGTH} characters or fewer so that it fits the text templates`);
  }

  const defaultCountryCode = env.DEFAULT_COUNTRY_CODE?.trim() || '+1';
  if (!/^\+[1-9]\d{0,2}$/.test(defaultCountryCode)) {
    problems.push(`DEFAULT_COUNTRY_CODE must look like +1 or +91, got "${env.DEFAULT_COUNTRY_CODE}"`);
  }

  const bookingsPerHourPerIp = Number(env.BOOKINGS_PER_HOUR_PER_IP ?? 10);
  if (!Number.isInteger(bookingsPerHourPerIp) || bookingsPerHourPerIp < 1) {
    problems.push(`BOOKINGS_PER_HOUR_PER_IP must be a whole number of at least 1, got "${env.BOOKINGS_PER_HOUR_PER_IP}"`);
  }

  const databaseUrl = (env.DATABASE_URL ?? env.POSTGRES_URL)?.trim() ?? '';
  if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    problems.push('DATABASE_URL must be a Postgres connection string that starts with postgres:// or postgresql://');
  }

  const proxy = env.TRUST_PROXY?.trim() ?? '';
  const trustProxy: boolean | number | string = proxy === '' || proxy === 'false' ? false : proxy === 'true' ? true : /^\d+$/.test(proxy) ? Number(proxy) : proxy;

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }

  return {
    port,
    webhookSecret,
    templateName: env.SENT_TEMPLATE_NAME ?? 'appointment_reminder_reply,sent_Appointment_Reminder_2',
    confirmationTemplateName: env.SENT_CONFIRMATION_TEMPLATE ?? 'appointment_confirmation_reply,sent_Appointment_Confirmation_1',
    rescheduleTemplateName: env.SENT_RESCHEDULE_TEMPLATE ?? 'sent_Appointment_Reschedule_1',
    cancellationTemplateName: env.SENT_CANCEL_TEMPLATE ?? 'sent_Appointment_Cancelled',
    businessName,
    services,
    defaultCountryCode,
    adminPassword: env.ADMIN_PASSWORD ?? '',
    slotRules: { timezone, startHour, endHour, slotMinutes, maxAdvanceDays: 14, minNoticeMinutes: Math.min(...reminderOptions) + 5 },
    reminderOptions,
    noReplyWarningHours,
    timezone,
    sandbox: env.SENT_SANDBOX === 'true',
    databasePath: env.DATABASE_PATH ?? './data/appointments.db',
    databaseUrl,
    trustProxy,
    bookingsPerHourPerIp,
  };
}
