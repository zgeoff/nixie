import { expect, test } from 'bun:test';
import type { ConnectorFailure } from '@heynixie/tools';
import { renderFailureMessage } from '@heynixie/tools';
import { buildGoogleFailure, forgottenOutcome } from './build-google-failure';

interface FailureCase {
  readonly name: string;
  readonly status: number;
  readonly isRateLimit: boolean;
  readonly retryAfterMs: number | null;
  readonly expected: ConnectorFailure;
}

test.each<FailureCase>([
  {
    name: 'a quota answer with a retry time',
    status: 429,
    isRateLimit: true,
    retryAfterMs: 4000,
    expected: {
      code: 'rate_limited',
      status: 429,
      retryAfterMs: 4000,
      detail: 'Google answered x',
    },
  },
  {
    name: 'a rate limit that Google sends as a 403',
    status: 403,
    isRateLimit: true,
    retryAfterMs: null,
    expected: { code: 'rate_limited', status: 403, detail: 'Google answered x' },
  },
  {
    name: 'a server error',
    status: 503,
    isRateLimit: false,
    retryAfterMs: null,
    expected: { code: 'failed', status: 503, detail: 'Google answered x' },
  },
  {
    name: 'a missing permission',
    status: 403,
    isRateLimit: false,
    retryAfterMs: null,
    expected: { code: 'refused', status: 403, detail: 'Google answered x' },
  },
  {
    name: 'a bad request',
    status: 400,
    isRateLimit: false,
    retryAfterMs: null,
    expected: { code: 'refused', status: 400, detail: 'Google answered x' },
  },
])('#buildGoogleFailure maps $name onto a connector error code', (row) => {
  const failure = buildGoogleFailure({
    status: row.status,
    isRateLimit: row.isRateLimit,
    retryAfterMs: row.retryAfterMs,
    reason: 'Google answered x',
  });

  expect(failure).toStrictEqual(row.expected);
});

test('it gives the forgotten connection the message that nixie writes for connection_unavailable', () => {
  const message: string = forgottenOutcome.message;

  expect(message).toBe(
    renderFailureMessage({ code: 'connection_unavailable' }, { nowMs: 0, detailChars: 1000 }),
  );
});
