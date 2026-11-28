import type { Clock } from '@heynixie/clock';
import type { ConnectorFailure, ToolOutcome } from '@heynixie/tools';
import { defaultDetailChars, renderFailureMessage } from '@heynixie/tools';

interface GoogleErrorReply {
  readonly status: number;
  readonly reason: string;

  // Google's own quota answer: 429, or 403 with a rate-limit reason
  readonly isRateLimit: boolean;
  readonly retryAfterMs: number | null;
}

// What a Google error means for a direct call. A quota answer is a rate limit, a server error can
// clear, and any other answer is a refusal that a retry would not change.
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

// An answer that came back with nothing nixie can read can clear, so it counts as a failure.
export function buildUnreadableFailure(detail: string): ConnectorFailure {
  return { code: 'failed', detail };
}

// The outcome of a direct call that failed. The endpoint retries it when it can clear, and writes
// the message the model reads.
export function buildFailureOutcome(failure: ConnectorFailure): ToolOutcome {
  return { status: 'error', message: failure.detail ?? failure.code, failure };
}

// The refusal of a step that runs before the call, such as the read that prepares a queued action.
// It never retries, so it carries the message the model reads.
export function buildFailureRefusal(
  failure: ConnectorFailure,
  clock: Pick<Clock, 'now'>,
): { readonly status: 'error'; readonly message: string } {
  return {
    status: 'error',
    message: renderFailureMessage(failure, { nowMs: clock.now(), detailChars: defaultDetailChars }),
  };
}

// A call that names a connection that was forgotten. The error names neither the connection nor its
// status.
export const forgottenOutcome = {
  status: 'error',
  message: '{"origin":"nixie","kind":"connection_unavailable"}',
  failure: { code: 'connection_unavailable' },
} as const satisfies ToolOutcome;

function pickCode(reply: GoogleErrorReply): 'rate_limited' | 'failed' | 'refused' {
  if (reply.isRateLimit) {
    return 'rate_limited';
  }

  return reply.status >= 500 ? 'failed' : 'refused';
}
