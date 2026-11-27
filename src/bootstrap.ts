import SentDm from '@sentdm/sentdm';
import { createApi, type Api } from './api';
import { ConfigError, loadConfig, type Config } from './config';
import { explainSentError } from './errors';
import { createSentMessenger } from './messenger';
import { createReminders } from './reminders';
import { openStore, type Store } from './store';

export class StartupError extends Error {}

export interface Runtime {
  config: Config;
  store: Store;
  api: Api;
}

function readConfig(): Config {
  try {
    return loadConfig();
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    const problems = err.problems.map((p) => `  - ${p}`).join('\n');
    throw new StartupError(`Cannot start, fix the configuration:\n${problems}\n\nSee .env.example for every setting.`);
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
      throw new StartupError(`Cannot start: ${explained?.message}`);
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

export async function createRuntime(): Promise<Runtime> {
  const config = readConfig();
  if (process.env.VERCEL && !config.databaseUrl) {
    throw new StartupError('Cannot start: Vercel does not keep files between requests, so set DATABASE_URL to a Postgres database, for example one from the Vercel Storage tab.');
  }

  let store: Store;
  try {
    store = await openStore(config);
  } catch (err) {
    throw new StartupError(`Cannot open the database at ${config.databaseUrl ? 'DATABASE_URL' : config.databasePath}: ${err instanceof Error ? err.message : String(err)}. Check the setting and that the database is reachable and writable.`);
  }

  const messenger = await connectToSent(config);
  const reminders = createReminders({ store, messenger, config });
  const api = createApi({ store, reminders, config, templateReport: () => messenger.templateReport(), twoWay: () => messenger.twoWay() });
  return { config, store, api };
}
