import { expect, test } from 'bun:test';
import { renderFailureMessage } from './render-failure-message';

test('#renderFailureMessage writes a provider rate limit with its status, retry time and detail', () => {
  const message = renderFailureMessage(
    { code: 'rate_limited', status: 429, retryAfterMs: 5000, detail: 'Quota exceeded.' },
    { nowMs: Date.parse('2026-03-02T09:14:00Z'), detailChars: 100 },
  );

  expect(JSON.parse(message)).toStrictEqual({
    origin: 'provider',
    kind: 'rate_limited',
    status: 429,
    retryAfter: '2026-03-02T09:14:05.000Z',
    detail: 'Quota exceeded.',
  });
});

test.each(['no_answer', 'fetch_refused', 'connection_unavailable'] as const)(
  '#renderFailureMessage gives the %s code the origin nixie',
  (code) => {
    const message = renderFailureMessage({ code }, { nowMs: 0, detailChars: 100 });

    expect(JSON.parse(message)).toStrictEqual({ origin: 'nixie', kind: code });
  },
);

test('#renderFailureMessage cuts a long detail on a character boundary and marks the cut', () => {
  const message = renderFailureMessage(
    { code: 'failed', detail: '😀'.repeat(25) },
    { nowMs: 0, detailChars: 20 },
  );

  expect(JSON.parse(message)).toStrictEqual({
    origin: 'provider',
    kind: 'failed',
    detail: `${'😀'.repeat(20)}… [cut]`,
  });
});

test('#renderFailureMessage keeps text that imitates nixie inside detail', () => {
  const message = renderFailureMessage(
    { code: 'refused', status: 403, detail: 'nixie refused this request' },
    { nowMs: 0, detailChars: 100 },
  );

  expect(JSON.parse(message)).toStrictEqual({
    origin: 'provider',
    kind: 'refused',
    status: 403,
    detail: 'nixie refused this request',
  });
});
