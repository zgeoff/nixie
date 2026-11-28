import type { ConnectorFailure } from '../types';

export interface FailureTime {
  readonly nowMs: number;
  readonly detailChars: number;
}

// The text the model reads for a failed connector call: a JSON object that nixie writes. `origin`
// says whether the provider answered, and the provider's own text appears only in `detail`, as an
// escaped string, so text that imitates nixie's words never sets `origin`.
export function renderFailureMessage(failure: ConnectorFailure, time: FailureTime): string {
  const origin =
    failure.code === 'rate_limited' || failure.code === 'failed' || failure.code === 'refused'
      ? 'provider'
      : 'nixie';

  return JSON.stringify({
    origin,
    kind: failure.code,
    ...(failure.status === undefined ? {} : { status: failure.status }),
    ...(failure.retryAfterMs === undefined
      ? {}
      : { retryAfter: new Date(time.nowMs + failure.retryAfterMs).toISOString() }),
    ...(failure.detail === undefined
      ? {}
      : { detail: cutDetail(failure.detail, time.detailChars) }),
  });
}

// Cuts on a character boundary, and marks the cut.
function cutDetail(detail: string, limit: number): string {
  const characters = [...detail];

  return characters.length <= limit ? detail : `${characters.slice(0, limit).join('')}… [cut]`;
}
