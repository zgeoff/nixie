import type { GuestFrame, ModelAPIErrorKind } from '@heynixie/wire';
import { parseErrorInfo } from './parse-error-info';
import type { TurnError } from './parse-notification';

type FailedFrame = Extract<GuestFrame, { type: 'failed' }>;

// Builds the failed frame of a turn that the CLI reports as failed. A model API refusal of the
// credential gives model_auth, and any other model API error gives model_api with the kind its
// status names. A failure that no model API call caused gives error, a context overflow included.
export function buildCodexFailure(error: TurnError): FailedFrame {
  const detail =
    error.additionalDetails === null || error.additionalDetails === undefined
      ? error.message
      : `${error.message}: ${error.additionalDetails}`;

  const info = parseErrorInfo(error.codexErrorInfo);

  if (info === null) {
    return { type: 'failed', reason: 'error', detail };
  }

  if (info.name === 'unauthorized' || info.status === 401 || info.status === 403) {
    return { type: 'failed', reason: 'model_auth', detail };
  }

  const kind = pickModelAPIError(info.name, info.status);

  return kind === null
    ? { type: 'failed', reason: 'error', detail }
    : { type: 'failed', reason: 'model_api', error: kind, detail };
}

const nameKinds = new Map<string, ModelAPIErrorKind>([
  ['rateLimitExceeded', 'rate_limit'],
  ['usageLimitExceeded', 'quota'],
  ['serverOverloaded', 'overloaded'],
  ['modelNotFound', 'model_not_found'],
  ['internalServerError', 'server_error'],
  ['badRequest', 'unknown'],
  ['other', 'unknown'],
  ['httpConnectionFailed', 'unknown'],
  ['responseStreamConnectionFailed', 'unknown'],
  ['responseStreamDisconnected', 'unknown'],
  ['responseTooManyFailedAttempts', 'unknown'],
]);

// null for a failure that is not a model API error
function pickModelAPIError(name: string, status: number | null): ModelAPIErrorKind | null {
  return status === null ? (nameKinds.get(name) ?? null) : pickStatusKind(status);
}

function pickStatusKind(status: number): ModelAPIErrorKind {
  if (status === 429) {
    return 'rate_limit';
  }

  if (status === 404) {
    return 'model_not_found';
  }

  return status >= 500 ? 'server_error' : 'unknown';
}
