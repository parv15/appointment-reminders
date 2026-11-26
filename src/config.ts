export interface Config {
  port: number;
  demo: boolean;
  webhookSecret: string;
  templateName: string;
  reminderLeadMinutes: number;
  timezone: string;
  sandbox: boolean;
  databasePath: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  const demo = process.env.DEMO_MODE === 'true';
  if (!demo) {
    required('SENT_DM_API_KEY');
  }
  return {
    port: Number(process.env.PORT ?? 3000),
    demo,
    webhookSecret: demo ? '' : required('SENT_DM_WEBHOOK_SECRET'),
    templateName: process.env.SENT_TEMPLATE_NAME ?? 'appointment_reminder',
    reminderLeadMinutes: Number(process.env.REMINDER_LEAD_MINUTES ?? 1440),
    timezone: process.env.BUSINESS_TIMEZONE ?? 'UTC',
    sandbox: process.env.SENT_SANDBOX === 'true',
    databasePath: process.env.DATABASE_PATH ?? (demo ? ':memory:' : './data/appointments.db'),
  };
}
