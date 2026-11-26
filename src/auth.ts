import type { RequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';

export function adminAuth(password: string): RequestHandler {
  const expected = Buffer.from(password);
  return (req, res, next) => {
    if (!password) {
      next();
      return;
    }
    const header = req.header('authorization') ?? '';
    const [scheme, encoded] = header.split(' ');
    const supplied = Buffer.from(Buffer.from(encoded ?? '', 'base64').toString('utf8').split(':').slice(1).join(':'));
    if (scheme === 'Basic' && supplied.length === expected.length && timingSafeEqual(supplied, expected)) {
      next();
      return;
    }
    res.set('WWW-Authenticate', 'Basic realm="Admin"').status(401).send('Admin sign-in required');
  };
}
