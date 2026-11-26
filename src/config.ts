export interface Config {
  port: number;
  demo: boolean;
  webhookSecret: string;
  templateName: string;
  businessName: string;
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

  const require = (name: string, hint: string) => {
    const value = env[name]?.trim();
    if (!value && !demo) {
      problems.push(`${name} is not set. ${hint}`);
    }
    return value ?? '';
  };

  require('SENT_DM_API_KEY', 'Create a key at https://app.sent.dm/dashboard/api-keys');
  const webhookSecret = env.SENT_DM_WEBHOOK_SECRET?.trim() ?? '';
  const businessName = require('BUSINESS_NAME', 'It appears in the reminder text, for example "Acme Dental"') || 'Demo Clinic';

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

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }

  return {
    port,
    demo,
    webhookSecret,
    templateName: env.SENT_TEMPLATE_NAME ?? 'appointment_reminder_reply',
    businessName,
    reminderLeadMinutes,
    timezone,
    sandbox: env.SENT_SANDBOX === 'true',
    databasePath: env.DATABASE_PATH ?? (demo ? ':memory:' : './data/appointments.db'),
  };
}
