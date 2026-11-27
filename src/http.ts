export const MAX_BODY_BYTES = 100_000;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function readText(req: Request): Promise<string> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'The request is too large.');
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'The request is too large.');
  return text;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await readText(req);
  if (text.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, 'The request body is not valid JSON.');
  }
}

export function clientAddress(req: Request, trustProxy: boolean | number | string): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (!forwarded) return req.headers.get('x-real-ip') ?? 'unknown';
  const parts = forwarded.split(',').map((part) => part.trim()).filter(Boolean);
  const hops = trustProxy === true ? parts.length : typeof trustProxy === 'number' && trustProxy > 0 ? trustProxy : 1;
  return parts[Math.max(0, parts.length - hops)] ?? 'unknown';
}

export function isSecure(req: Request): boolean {
  return new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() === 'https';
}
