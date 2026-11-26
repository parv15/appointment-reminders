import express, { type ErrorRequestHandler } from 'express';
import { fileURLToPath } from 'node:url';
import { buildActivity } from './activity.js';
import { attentionFor } from './attention.js';
import { adminAuth } from './auth.js';
import type { Config } from './config.js';
import { explainSentError } from './errors.js';
import type { TemplateReport } from './messenger.js';
import { ValidationError, type Reminders } from './reminders.js';
import { verifyWebhook } from './signature.js';
import { availableSlots, localDate } from './slots.js';
import type { Appointment, Store } from './store.js';

const E164 = /^\+[1-9]\d{6,14}$/;
const NAME = /^\p{L}[\p{L} '’-]{1,29}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));
const ADMIN_DIR = fileURLToPath(new URL('../admin', import.meta.url));

const optionalNumber = (value: unknown) => (typeof value === 'number' ? value : undefined);

const header = (req: express.Request, name: string) =>
  req.header(`webhook-${name}`) ?? req.header(`x-webhook-${name}`) ?? '';

const publicView = (a: Appointment) => ({
  id: a.id,
  name: a.name,
  service: a.service,
  phone: a.phone,
  startsAt: a.startsAt,
  status: a.status,
  alertStatus: a.confirmationMessageId ? (a.confirmationStatus ?? 'queued') : null,
  alertChannel: a.confirmationChannel,
  reminderMinutes: a.reminderLeadMinutes,
  reminderStatus: a.reminderMessageId ? (a.reminderStatus ?? 'queued') : null,
});

export function createApp(deps: { store: Store; reminders: Reminders; config: Config; templateReport?: () => Promise<TemplateReport[]> }) {
  const { store, reminders, config, templateReport } = deps;
  const app = express();
  const admin = adminAuth(config.adminPassword);

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
  app.use('/admin', admin, express.static(ADMIN_DIR));
  app.use(express.static(PUBLIC_DIR));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      sandbox: config.sandbox,
      businessName: config.businessName,
      services: config.services,
      timezone: config.timezone,
      defaultCountryCode: config.defaultCountryCode,
      reminderOptions: config.reminderOptions,
      maxAdvanceDays: config.slotRules.maxAdvanceDays,
      confirmationAlerts: config.confirmationTemplateName !== '',
    });
  });

  app.get('/api/slots', (req, res) => {
    const date = String(req.query.date ?? '');
    if (!DATE.test(date)) throw new ValidationError('Pick a valid date.');
    const exclude = typeof req.query.exclude === 'string' ? req.query.exclude : undefined;
    const slots = availableSlots(date, config.slotRules, store.takenStarts(exclude), new Date());
    res.json({ date, slots: slots.map((s) => s.toISOString()) });
  });

  app.post('/api/bookings', async (req, res) => {
    const { service, name, phone, startsAt, reminderMinutes } = req.body ?? {};
    if (typeof service !== 'string' || !config.services.includes(service)) throw new ValidationError('Choose a service.');
    if (typeof name !== 'string' || !NAME.test(name.trim())) {
      throw new ValidationError('Enter your name using letters only (2 to 30 characters).');
    }
    if (typeof phone !== 'string' || !E164.test(phone)) {
      throw new ValidationError('Enter a valid mobile number.');
    }
    const start = typeof startsAt === 'string' ? new Date(startsAt) : new Date(NaN);
    if (Number.isNaN(start.getTime())) throw new ValidationError('Pick a date and time.');
    const open = availableSlots(localDate(start, config.timezone), config.slotRules, store.takenStarts(), new Date());
    if (!open.some((s) => s.getTime() === start.getTime())) {
      throw new ValidationError('That time is no longer available. Please pick another slot.');
    }

    const booking = await reminders.book({ name: name.trim(), service, phone, startsAt: start.toISOString(), reminderMinutes: optionalNumber(reminderMinutes) });
    res.status(201).json({ ...publicView(booking), ...(booking.confirmationError && { alertError: booking.confirmationError }) });
  });

  app.get('/api/bookings/:id', async (req, res) => {
    await reminders.syncStatuses();
    const booking = store.get(req.params.id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }
    res.json(publicView(booking));
  });

  app.use('/api/admin', admin);

  app.get('/api/admin/appointments', async (_req, res) => {
    await reminders.syncStatuses();
    const now = new Date();
    res.json(store.list().map((a) => ({ ...a, attention: attentionFor(a, now, config.noReplyWarningHours) })));
  });

  app.get('/api/admin/templates', async (_req, res) => {
    res.json(templateReport ? await templateReport() : []);
  });

  app.post('/api/admin/appointments/:id/reschedule', async (req, res) => {
    const { startsAt, reminderMinutes } = req.body ?? {};
    const start = typeof startsAt === 'string' ? new Date(startsAt) : new Date(NaN);
    if (Number.isNaN(start.getTime())) throw new ValidationError('Pick a date and time.');

    const open = availableSlots(localDate(start, config.timezone), config.slotRules, store.takenStarts(req.params.id), new Date());
    if (!open.some((s) => s.getTime() === start.getTime())) {
      throw new ValidationError('That time is not available. Pick another slot.');
    }

    const moved = await reminders.reschedule(req.params.id, { startsAt: start.toISOString(), reminderMinutes: optionalNumber(reminderMinutes) });
    if (!moved) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }
    res.json(moved);
  });

  app.get('/api/admin/activity', (_req, res) => {
    res.json(buildActivity(store.list(), config.reminderOptions[0]!));
  });

  app.post('/api/admin/appointments/:id/cancel', async (req, res) => {
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
