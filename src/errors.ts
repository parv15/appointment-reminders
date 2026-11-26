import SentDm from '@sentdm/sentdm';

export interface Explained {
  status: number;
  message: string;
  code?: string;
  requestId?: string;
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: Record<string, string[]> };
  meta?: { request_id?: string };
}

export function explainSentError(err: unknown): Explained | undefined {
  if (!(err instanceof SentDm.APIError)) {
    return undefined;
  }

  const body = (err.error ?? {}) as ErrorBody;
  const code = body.error?.code;
  const requestId = body.meta?.request_id;
  const detail = Object.values(body.error?.details ?? {})[0]?.[0];
  const reason = [body.error?.message, detail].filter(Boolean).join(': ');

  if (err instanceof SentDm.AuthenticationError || err instanceof SentDm.PermissionDeniedError) {
    return { status: 502, code, requestId, message: 'Sent rejected the API key. Check SENT_DM_API_KEY.' };
  }
  if (err instanceof SentDm.NotFoundError) {
    return {
      status: 502,
      code,
      requestId,
      message: 'Sent could not find the template. Check SENT_TEMPLATE_NAME and that the template exists on your account.',
    };
  }
  if (err instanceof SentDm.RateLimitError) {
    return { status: 429, code, requestId, message: 'Sent is rate limiting requests. Try again in a moment.' };
  }
  if (err instanceof SentDm.BadRequestError || err instanceof SentDm.UnprocessableEntityError) {
    return { status: 400, code, requestId, message: `Sent rejected the request${reason ? `: ${reason}` : ''}` };
  }
  if (err instanceof SentDm.APIConnectionError) {
    return { status: 503, message: 'Could not reach Sent. Check the network connection and try again.' };
  }
  return { status: 502, code, requestId, message: `Sent returned an error${reason ? `: ${reason}` : ` (${err.status})`}` };
}
