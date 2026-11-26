import express, { type ErrorRequestHandler } from 'express';
import { fileURLToPath } from 'node:url';
import { buildActivity } from './activity.js';
import { attentionFor } from './attention.js';
import { createAdminAuth } from './auth.js';
import type { Config } from './config.js';
import { explainSentError } from './errors.js';
import type { TemplateReport } from './messenger.js';
import { createRateLimiter } from './rate-limit.js';
import { ValidationError, type InboundPayload, type Reminders } from './reminders.js';
import { verifyWebhook } from './signature.js';
import { availableSlots, isRealDate, localDate, upcomingDays } from './slots.js';
import type { Appointment, Store } from './store.js';

const E164 = /^\+[1-9]\d{6,14}$/;
const NAME = /^\p{L}[\p{L} '’-]{1,29}$/u;
const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));
const ADMIN_DIR = fileURLToPath(new URL('../admin', import.meta.url));
const LOGIN_PAGE = fileURLToPath(new URL('../public/admin-login.html', import.meta.url));

const optionalMinutes = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new ValidationError('Choose one of the offered reminder times.', 'slot_unavailable');
  return value;
};

const parseStart = (value: unknown, message: string) => {
  const start = typeof value === 'string' ? new Date(value) : new Date(NaN);
  if (Number.isNaN(start.getTime())) throw new ValidationError(message);
  return start;
};

const header = (req: express.Request, name: string) =>
  req.header(`webhook-${name}`) ?? req.header(`x-webhook-${name}`) ?? '';

const publicView = (a: Appointment, defaultLeadMinutes: number) => ({
  id: a.id,
  name: a.name,
  service: a.service,
  phone: a.phone,
  startsAt: a.startsAt,
  status: a.status,
  alertStatus: a.confirmationMessageId ? (a.confirmationStatus ?? 'queued') : null,
  alertChannel: a.confirmationChannel,
  reminderMinutes: a.reminderLeadMinutes ?? defaultLeadMinutes,
  reminderStatus: a.reminderMessageId ? (a.reminderStatus ?? 'queued') : null,
});

export function createApp(deps: { store: Store; reminders: Reminders; config: Config; templateReport?: () => Promise<TemplateReport[]> }) {
  const { store, reminders, config, templateReport } = deps;
  const app = express();
  const auth = createAdminAuth(config.adminPassword);
  const bookingLimiter = createRateLimiter(config.bookingsPerHourPerIp, 60 * 60_000);
  app.set('trust proxy', config.trustProxy);

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

    const eventId = header(req, 'id');
    if (!store.claimEvent(eventId)) {
      res.json({ received: true, duplicate: true });
      return;
    }

    let event: { field?: unknown; event?: unknown; payload?: Record<string, unknown> | null };
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      res.status(400).json({ error: 'The webhook body is not valid JSON.' });
      return;
    }

    try {
      if (event?.field === 'message' && typeof event.event === 'string') {
        const payload = event.payload ?? {};
        if (event.event === 'message.received') {
          if (typeof payload.inbound_number === 'string') {
            await reminders.handleInbound(payload as unknown as InboundPayload);
          }
        } else {
          reminders.handleStatus(event.event, payload as { message_id?: string; channel?: string });
        }
      }
      res.json({ received: true });
    } catch (err) {
      store.releaseEvent(eventId);
      const explained = explainSentError(err);
      console.error(`Webhook ${eventId} failed: ${explained?.message ?? (err instanceof Error ? err.message : err)}`);
      res.status(500).json({ error: 'The event could not be processed. It can be delivered again.' });
    }
  });

  app.use(express.json());
  app.get('/admin/login', (req, res) => {
    if (auth.isSignedIn(req)) res.redirect('/admin/');
    else res.sendFile(LOGIN_PAGE);
  });
  app.use('/admin', auth.requirePage, express.static(ADMIN_DIR));
  app.use(express.static(PUBLIC_DIR));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/config', async (_req, res) => {
    const templates = templateReport ? await templateReport().catch(() => []) : [];
    const repliesInText = templates.length > 0 && templates.every((t) => t.using === t.preferred && t.preferredStatus === 'APPROVED');
    res.json({
      repliesInText,
      sandbox: config.sandbox,
      businessName: config.businessName,
      services: config.services,
      timezone: config.timezone,
      defaultCountryCode: config.defaultCountryCode,
      reminderOptions: config.reminderOptions,
      maxAdvanceDays: config.slotRules.maxAdvanceDays,
      days: upcomingDays(new Date(), config.timezone, config.slotRules.maxAdvanceDays + 1),
      confirmationAlerts: config.confirmationTemplateName !== '',
    });
  });

  app.get('/api/slots', (req, res) => {
    const date = String(req.query.date ?? '');
    if (!isRealDate(date)) throw new ValidationError('Pick a valid date.');
    const exclude = typeof req.query.exclude === 'string' ? req.query.exclude : undefined;
    const slots = availableSlots(date, config.slotRules, store.takenStarts(exclude), new Date());
    res.json({ date, slots: slots.map((s) => s.toISOString()) });
  });

  app.post('/api/bookings', async (req, res) => {
    if (!bookingLimiter.allow(req.ip ?? 'unknown')) {
      res.status(429).json({ error: 'Too many booking attempts from this connection. Try again in an hour.' });
      return;
    }
    const { service, name, phone, startsAt, reminderMinutes } = req.body ?? {};
    if (typeof service !== 'string' || !config.services.includes(service)) throw new ValidationError('Choose a service.');
    if (typeof name !== 'string' || !NAME.test(name.trim())) {
      throw new ValidationError('Enter your name using letters only (2 to 30 characters).');
    }
    if (typeof phone !== 'string' || !E164.test(phone)) {
      throw new ValidationError('Enter a valid mobile number.');
    }
    const start = parseStart(startsAt, 'Pick a date and time.');
    const minutes = optionalMinutes(reminderMinutes);
    const repeat = store.findActive(phone, start.toISOString());
    const open = availableSlots(localDate(start, config.timezone), config.slotRules, store.takenStarts(), new Date());
    if (!repeat && !open.some((s) => s.getTime() === start.getTime())) {
      throw new ValidationError('That time is no longer available. Please pick another slot.', 'slot_unavailable');
    }

    const booking = await reminders.book({ name: name.trim(), service, phone, startsAt: start.toISOString(), reminderMinutes: minutes });
    res.status(201).json({ ...publicView(booking, config.reminderOptions[0]!), ...(booking.confirmationError && { alertError: booking.confirmationError }) });
  });

  app.get('/api/bookings/:id', async (req, res) => {
    await reminders.syncStatuses();
    const booking = store.get(req.params.id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }
    res.json(publicView(booking, config.reminderOptions[0]!));
  });

  app.get('/api/admin/session', (req, res) => {
    res.json({ required: auth.enabled, signedIn: auth.isSignedIn(req) });
  });
  app.post('/api/admin/login', auth.login);
  app.post('/api/admin/logout', auth.logout);
  app.use('/api/admin', auth.requireApi);

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
    const start = parseStart(startsAt, 'Pick a date and time.');
    const minutes = optionalMinutes(reminderMinutes);

    const open = availableSlots(localDate(start, config.timezone), config.slotRules, store.takenStarts(req.params.id), new Date());
    if (!open.some((s) => s.getTime() === start.getTime())) {
      throw new ValidationError('That time is not available. Pick another slot.', 'slot_unavailable');
    }

    const moved = await reminders.reschedule(req.params.id, { startsAt: start.toISOString(), reminderMinutes: minutes });
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
      res.status(400).json({ error: err.message, ...(err.code && { code: err.code }) });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'The request body is not valid JSON.' });
      return;
    }
    const httpStatus = (err as { status?: unknown })?.status;
    if (typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500) {
      res.status(httpStatus).json({ error: httpStatus === 413 ? 'The request is too large.' : 'The request could not be read.' });
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
