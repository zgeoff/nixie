import type { ConnectorFailure } from '@heynixie/tools';

interface GoogleErrorReply {
  readonly status: number;
  readonly reason: string;

  // Google's own quota answer: 429, or 403 with a rate-limit reason
  readonly isRateLimit: boolean;
  readonly retryAfterMs: number | null;
}

export function buildGoogleFailure(reply: GoogleErrorReply): ConnectorFailure {
  const code = pickCode(reply);

  return {
    code,
    status: reply.status,
    ...(reply.isRateLimit && reply.retryAfterMs !== null
      ? { retryAfterMs: reply.retryAfterMs }
      : {}),
    detail: reply.reason,
  };
}

function pickCode(reply: GoogleErrorReply): 'rate_limited' | 'failed' | 'refused' {
  if (reply.isRateLimit) {
    return 'rate_limited';
  }

  return reply.status >= 500 ? 'failed' : 'refused';
}
