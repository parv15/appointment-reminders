import SentDm from '@sentdm/sentdm';
import { createApp } from './app.js';
import { ConfigError, loadConfig, type Config } from './config.js';
import { explainSentError } from './errors.js';
import { createSentMessenger } from './messenger.js';
import { createReminders } from './reminders.js';
import { Store } from './store.js';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readConfig(): Config {
  try {
    return loadConfig();
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    const problems = err.problems.map((p) => `  - ${p}`).join('\n');
    return fail(`Cannot start, fix the configuration:\n${problems}\n\nSee .env.example for every setting.`);
  }
}

async function connectToSent(config: Config) {
  const sent = createSentMessenger({
    sandbox: config.sandbox,
    templates: { reminder: config.templateName, confirmation: config.confirmationTemplateName, reschedule: config.rescheduleTemplateName, cancellation: config.cancellationTemplateName },
  });

  try {
    for (const warning of await sent.verify()) {
      console.warn(`Warning: ${warning}`);
    }
  } catch (err) {
    const explained = explainSentError(err);
    if (err instanceof SentDm.AuthenticationError || err instanceof SentDm.PermissionDeniedError) {
      fail(`Cannot start: ${explained?.message}`);
    }
    console.warn(`Warning: could not verify the Sent setup. ${explained?.message ?? String(err)}`);
  }

  if (!config.webhookSecret) {
    console.warn('Warning: SENT_DM_WEBHOOK_SECRET is not set. Delivery status is still tracked, but customer replies (C or R) are ignored until a webhook is registered.');
  }
  if (!config.adminPassword) {
    console.warn('Warning: ADMIN_PASSWORD is not set, so /admin is open to anyone who can reach this server.');
  } else if (config.adminPassword.length < 8) {
    console.warn('Warning: ADMIN_PASSWORD is shorter than 8 characters. Use a longer password before you deploy.');
  }
  return sent;
}

const config = readConfig();
let store: Store;
try {
  store = new Store(config.databasePath);
} catch (err) {
  fail(`Cannot open the database at ${config.databasePath}: ${err instanceof Error ? err.message : String(err)}. Check DATABASE_PATH and that the folder is writable.`);
}
const messenger = await connectToSent(config);
const reminders = createReminders({ store, messenger, config });

const server = createApp({ store, reminders, config, templateReport: () => messenger.templateReport(), twoWay: () => messenger.twoWay() }).listen(config.port, (err?: NodeJS.ErrnoException) => {
  if (err) {
    fail(err.code === 'EADDRINUSE' ? `Port ${config.port} is already in use. Set PORT to another value.` : `Cannot listen on port ${config.port}: ${err.message}`);
  }
  console.log(`Appointment reminders listening on http://localhost:${config.port}`);
});

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled error:', reason);
});
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
