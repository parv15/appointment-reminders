import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { DemoMessenger } from './demo.js';
import { createSentMessenger } from './messenger.js';
import { createReminders } from './reminders.js';
import { Store } from './store.js';

const config = loadConfig();
const store = new Store(config.databasePath);
const demo = config.demo
  ? new DemoMessenger((messageId, status) => store.setReminderStatus(messageId, status))
  : undefined;
const messenger = demo ?? createSentMessenger(config.sandbox);
const reminders = createReminders({ store, messenger, config });

createApp({ store, reminders, config, demo }).listen(config.port, () => {
  console.log(`Appointment reminders listening on http://localhost:${config.port}`);
  if (config.demo) {
    console.log('Demo mode: Sent is simulated locally, nothing is sent');
  }
});
