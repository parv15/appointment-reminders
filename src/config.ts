import type { SlotRules } from './slots.js';

export interface Config {
  port: number;
  demo: boolean;
  webhookSecret: string;
  templateName: string;
  confirmationTemplateName: string;
  businessName: string;
  services: string[];
  defaultCountryCode: string;
  adminPassword: string;
  slotRules: SlotRules;
  reminderLeadMinutes: number;
  timezone: string;
  sandbox: boolean;
  databasePath: string;
}

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
  const demo = env.DEMO_MODE === 'true';

  const requiredUnlessDemo = (name: string, hint: string) => {
    const value = env[name]?.trim();
    if (!value && !demo) {
      problems.push(`${name} is not set. ${hint}`);
    }
    return value ?? '';
  };

  requiredUnlessDemo('SENT_DM_API_KEY', 'Create a key at https://app.sent.dm/dashboard/api-keys');
  const webhookSecret = env.SENT_DM_WEBHOOK_SECRET?.trim() ?? '';
  const businessName = requiredUnlessDemo('BUSINESS_NAME', 'It appears in the reminder text, for example "Acme Dental"') || 'Demo Clinic';

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push(`PORT must be a number between 1 and 65535, got "${env.PORT}"`);
  }

  const reminderLeadMinutes = Number(env.REMINDER_LEAD_MINUTES ?? 1440);
  if (!Number.isInteger(reminderLeadMinutes) || reminderLeadMinutes < 1) {
    problems.push(`REMINDER_LEAD_MINUTES must be a positive whole number, got "${env.REMINDER_LEAD_MINUTES}"`);
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

  const services = (env.SERVICES ?? 'Appointment').split(',').map((s) => s.trim()).filter(Boolean);
  if (services.length === 0) {
    problems.push('SERVICES must list at least one service, for example "Dental checkup,Teeth cleaning"');
  }

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }

  return {
    port,
    demo,
    webhookSecret,
    templateName: env.SENT_TEMPLATE_NAME ?? 'appointment_reminder_reply,sent_Appointment_Reminder_2',
    confirmationTemplateName: env.SENT_CONFIRMATION_TEMPLATE ?? 'appointment_confirmation_reply,sent_Appointment_Confirmation_1',
    businessName,
    services,
    defaultCountryCode: env.DEFAULT_COUNTRY_CODE ?? '+1',
    adminPassword: env.ADMIN_PASSWORD ?? '',
    slotRules: { timezone, startHour, endHour, slotMinutes, maxAdvanceDays: 14 },
    reminderLeadMinutes,
    timezone,
    sandbox: env.SENT_SANDBOX === 'true',
    databasePath: env.DATABASE_PATH ?? (demo ? ':memory:' : './data/appointments.db'),
  };
}
