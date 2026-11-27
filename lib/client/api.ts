export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface ErrorBody {
  error?: string;
  code?: string;
}

export async function api<T>(path: string, options: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      ...(options.body !== undefined && {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options.body),
      }),
    });
  } catch {
    throw new Error('Cannot reach the server. Is it still running?');
  }
  const body: unknown = await response.json().catch(() => ({}));
  if (response.status === 401 && path.startsWith('/api/admin/') && path !== '/api/admin/login') {
    window.location.href = '/admin/login';
  }
  if (!response.ok) {
    const failure = (body ?? {}) as ErrorBody;
    throw new ApiError(failure.error ?? `Request failed (${response.status})`, response.status, failure.code);
  }
  return body as T;
}
