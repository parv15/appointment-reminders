import { buildActivity } from './activity';
import { attentionFor } from './attention';
import { createAdminAuth } from './auth';
import type { Config } from './config';
import { explainSentError } from './errors';
import { HttpError, clientAddress, json, readJson, readText } from './http';
import type { TemplateReport } from './messenger';
import { createRateLimiter } from './rate-limit';
import { ValidationError, type InboundPayload, type Reminders } from './reminders';
import { verifyWebhook } from './signature';
import { availableSlots, isRealDate, localDate, upcomingDays } from './slots';
import type { Appointment, Store } from './store';

const E164 = /^\+[1-9]\d{6,14}$/;
const NAME = /^\p{L}[\p{L} '\u2019-]{1,29}$/u;

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

const header = (req: Request, name: string) => req.headers.get(`webhook-${name}`) ?? req.headers.get(`x-webhook-${name}`) ?? '';

const publicView = (a: Appointment, defaultLeadMinutes: number) => ({
  id: a.id,
  name: a.name,
  service: a.service,
  phone: a.phone,
  startsAt: a.startsAt,
  status: a.status,
  alertStatus: a.confirmationMessageId ? (a.confirmationStatus ?? 'queued') : null,
  alertChannel: a.confirmationChannel,
  alertReason: a.confirmationReason,
  reminderMinutes: a.reminderLeadMinutes ?? defaultLeadMinutes,
  reminderStatus: a.reminderMessageId ? (a.reminderStatus ?? 'queued') : null,
});

export interface ApiDeps {
  store: Store;
  reminders: Reminders;
  config: Config;
  templateReport?: () => Promise<TemplateReport[]>;
  twoWay?: () => Promise<boolean>;
  canReply?: (phone: string) => Promise<boolean>;
}

export type Api = (req: Request) => Promise<Response>;

export function createApi(deps: ApiDeps): Api {
  const { store, reminders, config, templateReport, twoWay, canReply } = deps;
  const auth = createAdminAuth(config.adminPassword, config.trustProxy);
  const bookingLimiter = createRateLimiter(config.bookingsPerHourPerIp, 60 * 60_000);
  const defaultLead = () => config.reminderOptions[0]!;

  const replyPossible = async (phone: string) => (canReply ? await canReply(phone).catch(() => true) : true);

  async function webhook(req: Request): Promise<Response> {
    if (!config.webhookSecret) {
      return json({ error: 'SENT_DM_WEBHOOK_SECRET is not configured, so webhooks cannot be verified.' }, 503);
    }
    const raw = await readText(req);
    const verified = verifyWebhook(Buffer.from(raw, 'utf8'), { id: header(req, 'id'), timestamp: header(req, 'timestamp'), signature: header(req, 'signature') }, config.webhookSecret);
    if (!verified) return json({ error: 'Invalid webhook signature' }, 401);

    const eventId = header(req, 'id');
    if (!(await store.claimEvent(eventId))) return json({ received: true, duplicate: true });

    let event: { field?: unknown; event?: unknown; payload?: Record<string, unknown> | null };
    try {
      event = JSON.parse(raw);
    } catch {
      return json({ error: 'The webhook body is not valid JSON.' }, 400);
    }

    try {
      if (event?.field === 'message' && typeof event.event === 'string') {
        const payload = event.payload ?? {};
        if (event.event === 'message.received') {
          if (typeof payload.inbound_number === 'string') {
            await reminders.handleInbound(payload as unknown as InboundPayload);
          }
        } else {
          await reminders.handleStatus(event.event, payload as { message_id?: string; channel?: string });
        }
      }
      return json({ received: true });
    } catch (err) {
      await store.releaseEvent(eventId);
      const explained = explainSentError(err);
      console.error(`Webhook ${eventId} failed: ${explained?.message ?? (err instanceof Error ? err.message : err)}`);
      return json({ error: 'The event could not be processed. It can be delivered again.' }, 500);
    }
  }

  async function publicConfig(): Promise<Response> {
    const templates = templateReport ? await templateReport().catch(() => []) : [];
    const repliesInText = templates.length > 0 && templates.every((t) => t.using === t.preferred && t.preferredStatus === 'APPROVED');
    const repliesPossible = twoWay ? await twoWay().catch(() => true) : true;
    return json({
      repliesInText,
      repliesPossible,
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
  }

  async function slots(url: URL): Promise<Response> {
    const date = url.searchParams.get('date') ?? '';
    if (!isRealDate(date)) throw new ValidationError('Pick a valid date.');
    const exclude = url.searchParams.get('exclude') ?? undefined;
    const open = availableSlots(date, config.slotRules, await store.takenStarts(exclude), new Date());
    return json({ date, slots: open.map((s) => s.toISOString()) });
  }

  async function createBooking(req: Request): Promise<Response> {
    if (!bookingLimiter.allow(clientAddress(req, config.trustProxy))) {
      return json({ error: 'Too many booking attempts from this connection. Try again in an hour.' }, 429);
    }
    const { service, name, phone, startsAt, reminderMinutes } = await readJson(req);
    if (typeof service !== 'string' || !config.services.includes(service)) throw new ValidationError('Choose a service.');
    if (typeof name !== 'string' || !NAME.test(name.trim())) {
      throw new ValidationError('Enter your name using letters only (2 to 30 characters).');
    }
    if (typeof phone !== 'string' || !E164.test(phone)) {
      throw new ValidationError('Enter a valid mobile number.');
    }
    const start = parseStart(startsAt, 'Pick a date and time.');
    const minutes = optionalMinutes(reminderMinutes);
    const repeat = await store.findActive(phone, start.toISOString());
    const open = availableSlots(localDate(start, config.timezone), config.slotRules, await store.takenStarts(), new Date());
    if (!repeat && !open.some((s) => s.getTime() === start.getTime())) {
      throw new ValidationError('That time is no longer available. Please pick another slot.', 'slot_unavailable');
    }

    const booking = await reminders.book({ name: name.trim(), service, phone, startsAt: start.toISOString(), reminderMinutes: minutes });
    return json({ ...publicView(booking, defaultLead()), repliesPossible: await replyPossible(booking.phone), ...(booking.confirmationError && { alertError: booking.confirmationError }) }, 201);
  }

  async function getBooking(id: string): Promise<Response> {
    await reminders.syncStatuses();
    const booking = await store.get(id);
    if (!booking) return json({ error: 'Booking not found.' }, 404);
    return json({ ...publicView(booking, defaultLead()), repliesPossible: await replyPossible(booking.phone) });
  }

  async function reschedule(req: Request, id: string): Promise<Response> {
    const { startsAt, reminderMinutes } = await readJson(req);
    const start = parseStart(startsAt, 'Pick a date and time.');
    const minutes = optionalMinutes(reminderMinutes);

    const open = availableSlots(localDate(start, config.timezone), config.slotRules, await store.takenStarts(id), new Date());
    if (!open.some((s) => s.getTime() === start.getTime())) {
      throw new ValidationError('That time is not available. Pick another slot.', 'slot_unavailable');
    }

    const moved = await reminders.reschedule(id, { startsAt: start.toISOString(), reminderMinutes: minutes });
    return moved ? json(moved) : json({ error: 'Appointment not found.' }, 404);
  }

  async function admin(req: Request, path: string): Promise<Response> {
    const method = req.method;
    if (method === 'GET' && path === '/api/admin/appointments') {
      await reminders.syncStatuses();
      const now = new Date();
      const rows = await store.list();
      return json(await Promise.all(rows.map(async (a) => ({ ...a, attention: attentionFor(a, now, config.noReplyWarningHours), repliesPossible: await replyPossible(a.phone) }))));
    }
    if (method === 'GET' && path === '/api/admin/templates') {
      return json(templateReport ? await templateReport() : []);
    }
    if (method === 'GET' && path === '/api/admin/activity') {
      return json(buildActivity(await store.list(), defaultLead()));
    }
    const action = /^\/api\/admin\/appointments\/([^/]+)\/(reschedule|cancel)$/.exec(path);
    if (method === 'POST' && action) {
      const id = decodeURIComponent(action[1]!);
      if (action[2] === 'reschedule') return reschedule(req, id);
      const cancelled = await reminders.cancel(id);
      return cancelled ? json(cancelled) : json({ error: 'Appointment not found.' }, 404);
    }
    return json({ error: 'Not found.' }, 404);
  }

  async function route(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = req.method;

    if (path === '/healthz' && method === 'GET') return json({ ok: true });
    if (path === '/webhooks/sent' && method === 'POST') return webhook(req);
    if (path === '/api/config' && method === 'GET') return publicConfig();
    if (path === '/api/slots' && method === 'GET') return slots(url);
    if (path === '/api/bookings' && method === 'POST') return createBooking(req);
    const booking = /^\/api\/bookings\/([^/]+)$/.exec(path);
    if (booking && method === 'GET') return getBooking(decodeURIComponent(booking[1]!));

    if (path === '/api/admin/session' && method === 'GET') {
      return json({ required: auth.enabled, signedIn: auth.isSignedIn(req.headers.get('cookie')) });
    }
    if (path === '/api/admin/login' && method === 'POST') return auth.login(req, await readJson(req));
    if (path === '/api/admin/logout' && method === 'POST') return auth.logout(req);
    if (path.startsWith('/api/admin/')) {
      if (!auth.isSignedIn(req.headers.get('cookie'))) return json({ error: 'Sign in required.' }, 401);
      return admin(req, path);
    }
    return json({ error: 'Not found.' }, 404);
  }

  return async (req) => {
    try {
      return await route(req);
    } catch (err) {
      if (err instanceof ValidationError) {
        return json({ error: err.message, ...(err.code && { code: err.code }) }, 400);
      }
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      const explained = explainSentError(err);
      if (explained) {
        console.error(`Sent error ${explained.code ?? ''} ${explained.requestId ?? ''}: ${explained.message}`);
        return json({ error: explained.message, requestId: explained.requestId }, explained.status);
      }
      console.error(err);
      return json({ error: 'Something went wrong on the server. Check the server log.' }, 500);
    }
  };
}
