import express, { type ErrorRequestHandler } from 'express';
import { fileURLToPath } from 'node:url';
import type { Config } from './config.js';
import type { DemoMessenger } from './demo.js';
import { explainSentError } from './errors.js';
import { ValidationError, type Reminders } from './reminders.js';
import { verifyWebhook } from './signature.js';
import type { Store } from './store.js';

const E164 = /^\+[1-9]\d{6,14}$/;
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const header = (req: express.Request, name: string) =>
  req.header(`webhook-${name}`) ?? req.header(`x-webhook-${name}`) ?? '';

export function createApp(deps: { store: Store; reminders: Reminders; config: Config; demo?: DemoMessenger }) {
  const { store, reminders, config, demo } = deps;
  const app = express();

  app.post('/webhooks/sent', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!config.webhookSecret) {
      res.status(503).json({ error: 'SENT_DM_WEBHOOK_SECRET is not configured, so webhooks cannot be verified.' });
      return;
    }
    const verified = verifyWebhook(
      req.body,
      { id: header(req, 'id'), timestamp: header(req, 'timestamp'), signature: header(req, 'signature') },
      config.webhookSecret,
    );
    if (!verified) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    res.json({ received: true });

    if (!store.markEventSeen(header(req, 'id'))) return;

    try {
      const event = JSON.parse(req.body.toString('utf8'));
      if (event.field !== 'message') return;
      if (event.event === 'message.received') {
        await reminders.handleInbound(event.payload);
      } else {
        reminders.handleStatus(event.event, event.payload ?? {});
      }
    } catch (err) {
      const explained = explainSentError(err);
      console.error(`Webhook ${header(req, 'id')} failed: ${explained?.message ?? (err instanceof Error ? err.message : err)}`);
    }
  });

  app.use(express.json());
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/config', (_req, res) => {
    res.json({ demo: demo !== undefined, sandbox: config.sandbox, reminderLeadMinutes: config.reminderLeadMinutes });
  });

  if (demo) {
    app.get('/api/demo/messages', (_req, res) => {
      res.json(demo.list());
    });

    app.post('/api/demo/messages/:id/release', (req, res) => {
      if (!demo.release(req.params.id)) {
        res.status(404).json({ error: 'That message is not waiting to be delivered.' });
        return;
      }
      res.json({ released: true });
    });

    app.post('/api/demo/replies', async (req, res) => {
      const { phone, text } = req.body ?? {};
      if (typeof phone !== 'string' || typeof text !== 'string' || !text.trim()) {
        throw new ValidationError('Pick an appointment and type a reply.');
      }
      demo.recordInbound(phone, text);
      await reminders.handleInbound({ inbound_number: phone, channel: 'sms', text });
      res.json({ received: true });
    });
  }

  app.get('/api/appointments', (_req, res) => {
    res.json(store.list());
  });

  app.post('/api/appointments', async (req, res) => {
    const { name, phone, startsAt } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) throw new ValidationError('Enter the customer name.');
    if (typeof phone !== 'string' || !E164.test(phone)) {
      throw new ValidationError('Enter the phone number in international format, for example +14155551234.');
    }
    if (typeof startsAt !== 'string' || !ISO_WITH_OFFSET.test(startsAt) || Number.isNaN(Date.parse(startsAt))) {
      throw new ValidationError('Pick a valid appointment date and time.');
    }
    res.status(201).json(await reminders.book({ name: name.trim(), phone, startsAt }));
  });

  app.post('/api/appointments/:id/cancel', async (req, res) => {
    const appointment = await reminders.cancel(req.params.id);
    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }
    res.json(appointment);
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'The request body is not valid JSON.' });
      return;
    }
    const explained = explainSentError(err);
    if (explained) {
      console.error(`Sent error ${explained.code ?? ''} ${explained.requestId ?? ''}: ${explained.message}`);
      res.status(explained.status).json({ error: explained.message, requestId: explained.requestId });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server. Check the server log.' });
  };
  app.use(onError);

  return app;
}
