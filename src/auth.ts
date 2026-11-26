import type { Request, RequestHandler } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'admin_session';
const SESSION_MS = 12 * 60 * 60_000;
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 5 * 60_000;

export interface AdminAuth {
  enabled: boolean;
  isSignedIn(req: Request): boolean;
  requirePage: RequestHandler;
  requireApi: RequestHandler;
  login: RequestHandler;
  logout: RequestHandler;
}

export function createAdminAuth(password: string): AdminAuth {
  const enabled = password !== '';
  const failures = new Map<string, { count: number; resetAt: number }>();

  const sign = (expires: string) => createHmac('sha256', password).update(`admin-session:${expires}`).digest('base64url');
  const same = (a: string, b: string) => {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  };

  const readCookie = (req: Request) =>
    (req.header('cookie') ?? '')
      .split(';')
      .map((part) => part.trim().split('='))
      .find(([name]) => name === COOKIE)?.[1];

  const isSignedIn = (req: Request) => {
    if (!enabled) return true;
    const [expires, signature] = (readCookie(req) ?? '').split('.');
    return Boolean(expires && signature) && Number(expires) > Date.now() && same(signature!, sign(expires!));
  };

  return {
    enabled,
    isSignedIn,

    requirePage(req, res, next) {
      if (isSignedIn(req)) next();
      else res.redirect('/admin/login');
    },

    requireApi(req, res, next) {
      if (isSignedIn(req)) next();
      else res.status(401).json({ error: 'Sign in required.' });
    },

    login(req, res) {
      const key = req.ip ?? 'unknown';
      const record = failures.get(key);
      if (record && record.resetAt > Date.now() && record.count >= MAX_FAILURES) {
        res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
        return;
      }

      const supplied = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!enabled || !same(supplied, password)) {
        const fresh = record && record.resetAt > Date.now() ? record : { count: 0, resetAt: Date.now() + FAILURE_WINDOW_MS };
        failures.set(key, { ...fresh, count: fresh.count + 1 });
        res.status(401).json({ error: 'That password is not right.' });
        return;
      }

      failures.delete(key);
      const expires = String(Date.now() + SESSION_MS);
      res.cookie(COOKIE, `${expires}.${sign(expires)}`, {
        httpOnly: true,
        sameSite: 'lax',
        secure: req.secure || req.header('x-forwarded-proto') === 'https',
        maxAge: SESSION_MS,
      });
      res.json({ ok: true });
    },

    logout(_req, res) {
      res.clearCookie(COOKIE);
      res.json({ ok: true });
    },
  };
}
