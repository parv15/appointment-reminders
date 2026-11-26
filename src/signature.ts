import { createHmac, timingSafeEqual } from 'node:crypto';

const REPLAY_WINDOW_SECONDS = 300;

export function verifyWebhook(
  rawBody: Buffer,
  headers: { id: string; timestamp: string; signature: string },
  secret: string,
  nowSeconds = Date.now() / 1000,
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) {
    return false;
  }
  if (Math.abs(nowSeconds - Number(headers.timestamp)) > REPLAY_WINDOW_SECONDS) {
    return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signed = `${headers.id}.${headers.timestamp}.${rawBody.toString('utf8')}`;
  const expected = Buffer.from('v1,' + createHmac('sha256', key).update(signed).digest('base64'));

  return headers.signature
    .trim()
    .split(/\s+/)
    .some((candidate) => {
      const received = Buffer.from(candidate);
      return received.length === expected.length && timingSafeEqual(received, expected);
    });
}
