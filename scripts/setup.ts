import SentDm from '@sentdm/sentdm';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ENV_FILE = join(ROOT, '.env');
const TEMPLATE_DIR = join(ROOT, 'docs', 'templates');

function usage(): never {
  console.error('Usage:\n  npm run setup:templates\n  npm run setup:webhook -- https://your-public-url');
  process.exit(1);
}

function setEnvValue(key: string, value: string) {
  const current = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  writeFileSync(ENV_FILE, pattern.test(current) ? current.replace(pattern, line) : `${current}${current.endsWith('\n') || !current ? '' : '\n'}${line}\n`);
}

async function createTemplates(client: SentDm) {
  const existing = new Set<string>();
  for (let page = 1; page <= 20; page++) {
    const response = await client.templates.list({ page, page_size: 100 });
    for (const template of response.data?.templates ?? []) {
      if (template.name) existing.add(template.name);
    }
    if (!response.data?.pagination?.has_more) break;
  }

  for (const file of readdirSync(TEMPLATE_DIR).filter((f) => f.endsWith('.json'))) {
    const definition = JSON.parse(readFileSync(join(TEMPLATE_DIR, file), 'utf8'));
    if (existing.has(definition.name)) {
      console.log(`${definition.name}: already exists, skipped`);
      continue;
    }
    const response = await client.templates.create(definition);
    console.log(`${definition.name}: created, status ${response.data?.status ?? 'unknown'}`);
  }
}

async function registerWebhook(client: SentDm, baseUrl: string) {
  if (!/^https:\/\//.test(baseUrl)) {
    console.error('The webhook URL must start with https://');
    process.exit(1);
  }
  const response = await client.webhooks.create({
    display_name: 'Appointment reminders',
    endpoint_url: `${baseUrl.replace(/\/$/, '')}/webhooks/sent`,
    event_types: ['message'],
  });
  const secret = response.data?.signing_secret;
  if (!secret) {
    console.error('Sent did not return a signing secret.');
    process.exit(1);
  }
  setEnvValue('SENT_DM_WEBHOOK_SECRET', secret);
  console.log(`Webhook registered: ${response.data?.endpoint_url}\nSigning secret saved to .env as SENT_DM_WEBHOOK_SECRET`);
}

const [command, argument] = process.argv.slice(2);
if (!process.env.SENT_DM_API_KEY) {
  console.error('SENT_DM_API_KEY is not set. Add it to .env first.');
  process.exit(1);
}

const client = new SentDm();
try {
  if (command === 'templates') await createTemplates(client);
  else if (command === 'webhook' && argument) await registerWebhook(client, argument);
  else usage();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
