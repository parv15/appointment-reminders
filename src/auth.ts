import { createHmac, timingSafeEqual } from 'node:crypto';
import { clientAddress, isSecure, json } from './http';

export const SESSION_COOKIE = 'admin_session';
const SESSION_MS = 12 * 60 * 60_000;
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 5 * 60_000;

export interface AdminAuth {
  enabled: boolean;
  isSignedIn(cookieHeader: string | null | undefined): boolean;
  login(req: Request, body: Record<string, unknown>): Response;
  logout(req: Request): Response;
}

function cookieFlags(req: Request, maxAge: number) {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isSecure(req) ? '; Secure' : ''}`;
}

export function createAdminAuth(password: string, trustProxy: boolean | number | string = false): AdminAuth {
  const enabled = password !== '';
  const failures = new Map<string, { count: number; resetAt: number }>();

  const sign = (expires: string) => createHmac('sha256', password).update(`admin-session:${expires}`).digest('base64url');
  const same = (a: string, b: string) => {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  };

  const readCookie = (header: string | null | undefined) =>
    (header ?? '')
      .split(';')
      .map((part) => part.trim().split('='))
      .find(([name]) => name === SESSION_COOKIE)?.[1];

  const isSignedIn = (cookieHeader: string | null | undefined) => {
    if (!enabled) return true;
    const [expires, signature] = (readCookie(cookieHeader) ?? '').split('.');
    return Boolean(expires && signature) && Number(expires) > Date.now() && same(signature!, sign(expires!));
  };

  return {
    enabled,
    isSignedIn,

    login(req, body) {
      const key = clientAddress(req, trustProxy);
      for (const [address, entry] of failures) {
        if (entry.resetAt <= Date.now()) failures.delete(address);
      }
      const record = failures.get(key);
      if (record && record.resetAt > Date.now() && record.count >= MAX_FAILURES) {
        return json({ error: 'Too many attempts. Try again in a few minutes.' }, 429);
      }

      const supplied = typeof body.password === 'string' ? body.password : '';
      if (!enabled || !same(supplied, password)) {
        const fresh = record && record.resetAt > Date.now() ? record : { count: 0, resetAt: Date.now() + FAILURE_WINDOW_MS };
        failures.set(key, { ...fresh, count: fresh.count + 1 });
        return json({ error: 'That password is not right.' }, 401);
      }

      failures.delete(key);
      const expires = String(Date.now() + SESSION_MS);
      return json({ ok: true }, 200, { 'set-cookie': `${SESSION_COOKIE}=${expires}.${sign(expires)}; ${cookieFlags(req, SESSION_MS / 1000)}` });
    },

    logout(req) {
      return json({ ok: true }, 200, { 'set-cookie': `${SESSION_COOKIE}=; ${cookieFlags(req, 0)}` });
    },
  };
}
