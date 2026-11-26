import SentDm from '@sentdm/sentdm';
import express, { type ErrorRequestHandler } from 'express';
import { fileURLToPath } from 'node:url';
import type { Config } from './config.js';
import { ValidationError, type Reminders } from './reminders.js';
import { verifyWebhook } from './signature.js';
import type { DemoMessenger } from './demo.js';
import type { Store } from './store.js';

const E164 = /^\+[1-9]\d{6,14}$/;
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const header = (req: express.Request, name: string) =>
  req.header(`webhook-${name}`) ?? req.header(`x-webhook-${name}`) ?? '';

export function createApp(deps: { store: Store; reminders: Reminders; config: Config; demo?: DemoMessenger }) {
  const { store, reminders, config, demo } = deps;
  const app = express();

  app.post('/webhooks/sent', express.raw({ type: 'application/json' }), async (req, res) => {
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

    const event = JSON.parse(req.body.toString('utf8'));
    if (event.field !== 'message') return;
    try {
      if (event.event === 'message.received') {
        await reminders.handleInbound(event.payload);
      } else {
        reminders.handleStatus(event.event, event.payload ?? {});
      }
    } catch (err) {
      console.error('webhook processing failed', err);
    }
  });

  app.use(express.json());
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/config', (_req, res) => {
    res.json({ demo: demo !== undefined });
  });

  if (demo) {
    app.get('/api/demo/messages', (_req, res) => {
      res.json(demo.list());
    });

    app.post('/api/demo/messages/:id/release', (req, res) => {
      if (!demo.release(req.params.id)) {
        res.status(404).json({ error: 'No scheduled message with that id' });
        return;
      }
      res.json({ released: true });
    });

    app.post('/api/demo/replies', async (req, res) => {
      const { phone, text } = req.body ?? {};
      if (typeof phone !== 'string' || typeof text !== 'string' || !text.trim()) {
        throw new ValidationError('phone and text are required');
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
    if (typeof name !== 'string' || !name.trim()) throw new ValidationError('name is required');
    if (typeof phone !== 'string' || !E164.test(phone)) throw new ValidationError('phone must be E.164, for example +14155551234');
    if (typeof startsAt !== 'string' || !ISO_WITH_OFFSET.test(startsAt) || Number.isNaN(Date.parse(startsAt))) {
      throw new ValidationError('startsAt must be ISO-8601 with a UTC offset');
    }
    res.status(201).json(await reminders.book({ name: name.trim(), phone, startsAt }));
  });

  app.post('/api/appointments/:id/cancel', async (req, res) => {
    const appointment = await reminders.cancel(req.params.id);
    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }
    res.json(appointment);
  });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
    } else if (err instanceof SentDm.APIError) {
      res.status(502).json({ error: 'Sent rejected the request', status: err.status, detail: err.message });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Internal error' });
    }
  };
  app.use(onError);

  return app;
}
