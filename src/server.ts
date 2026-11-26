import SentDm from '@sentdm/sentdm';
import { createApp } from './app.js';
import { ConfigError, loadConfig, type Config } from './config.js';
import { DemoMessenger } from './demo.js';
import { explainSentError } from './errors.js';
import { createSentMessenger } from './messenger.js';
import { createReminders } from './reminders.js';
import { Store } from './store.js';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    fail(`Cannot start, fix the configuration:\n${err.problems.map((p) => `  - ${p}`).join('\n')}\n\nSee .env.example, or run "npm run demo" to try it without Sent.`);
  }
  throw err;
}

const store = new Store(config.databasePath);
const demo = config.demo
  ? new DemoMessenger((messageId, status) => store.setMessageStatus(messageId, status))
  : undefined;

let messenger;
if (demo) {
  messenger = demo;
} else {
  const sent = createSentMessenger({
    sandbox: config.sandbox,
    templateName: config.templateName,
    confirmationTemplateName: config.confirmationTemplateName,
  });
  try {
    for (const warning of await sent.verify()) {
      console.warn(`Warning: ${warning}`);
    }
    if (!config.webhookSecret) {
      console.warn('Warning: SENT_DM_WEBHOOK_SECRET is not set. Delivery status is still tracked, but customer replies (C or R) are ignored until a webhook is registered (README step 3).');
    }
  } catch (err) {
    const explained = explainSentError(err);
    if (err instanceof SentDm.AuthenticationError || err instanceof SentDm.PermissionDeniedError) {
      fail(`Cannot start: ${explained?.message}`);
    }
    console.warn(`Warning: could not verify the Sent setup. ${explained?.message ?? String(err)}`);
  }
  messenger = sent;
}

const reminders = createReminders({ store, messenger, config });
if (!config.adminPassword && !config.demo) {
  console.warn('Warning: ADMIN_PASSWORD is not set, so /admin is open to anyone who can reach this server.');
}
const server = createApp({ store, reminders, config, demo }).listen(config.port, (err?: NodeJS.ErrnoException) => {
  if (err) {
    fail(err.code === 'EADDRINUSE' ? `Port ${config.port} is already in use. Set PORT to another value.` : `Cannot listen on port ${config.port}: ${err.message}`);
  }
  console.log(`Appointment reminders listening on http://localhost:${config.port}`);
  if (demo) {
    console.log('Demo mode: Sent is simulated locally, nothing is sent');
  }
});

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
