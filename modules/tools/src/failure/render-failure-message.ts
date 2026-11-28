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

  const retryAt = new Date(time.nowMs + (failure.retryAfterMs ?? 0));

  return JSON.stringify({
    origin,
    kind: failure.code,
    ...(failure.status === undefined ? {} : { status: failure.status }),
    ...(failure.retryAfterMs === undefined || Number.isNaN(retryAt.getTime())
      ? {}
      : { retryAfter: retryAt.toISOString() }),
    ...(failure.detail === undefined
      ? {}
      : { detail: cutDetail(failure.detail, time.detailChars) }),
  });
}

// Cuts on a character boundary, and marks the cut.
function cutDetail(detail: string, limit: number): string {
  let kept = '';
  let count = 0;

  for (const character of detail) {
    if (count === limit) {
      return `${kept}… [cut]`;
    }

    kept += character;
    count += 1;
  }

  return detail;
}
