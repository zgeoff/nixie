import { expect, test } from 'bun:test';
import { hashSecret } from './hash-secret.ts';
import { pickApprovalRefusal } from './pick-approval-refusal.ts';

test('it allows the issued token from its own session within the lifetime', () => {
  expect(
    pickApprovalRefusal({
      sessionToken: 'session-a',
      approval: {
        tokenHash: hashSecret('token-1'),
        sessionToken: 'session-a',
        issuedAt: 1_000,
        used: false,
      },
      token: 'token-1',
      nowMs: 1_000 + 15 * 60 * 1000,
      lifetimeMs: 15 * 60 * 1000,
    }),
  ).toBeNull();
});

test.each([
  ['no session', null, 'session-a', 'token-1', false, 1_000, 401, 'no session'],
  ['a wrong token', 'session-a', 'session-a', 'token-2', false, 1_000, 403, 'wrong token'],
  ['an empty token', 'session-a', 'session-a', '', false, 1_000, 403, 'wrong token'],
  ['another session', 'session-b', 'session-a', 'token-1', false, 1_000, 403, 'another session'],
  ['a used token', 'session-a', 'session-a', 'token-1', true, 1_000, 409, 'token already used'],
  [
    'a token past its lifetime',
    'session-a',
    'session-a',
    'token-1',
    false,
    1_000 + 15 * 60 * 1000 + 1,
    410,
    'token expired',
  ],
])(
  'it refuses %s',
  (_label, sessionToken, approvalSession, token, used, nowMs, status, reason) => {
    expect(
      pickApprovalRefusal({
        sessionToken,
        approval: {
          tokenHash: hashSecret('token-1'),
          sessionToken: approvalSession,
          issuedAt: 1_000,
          used,
        },
        token,
        nowMs,
        lifetimeMs: 15 * 60 * 1000,
      }),
    ).toMatchObject({ status, reason });
  },
);

test('it refuses an approval the server never issued', () => {
  expect(
    pickApprovalRefusal({
      sessionToken: 'session-a',
      approval: undefined,
      token: 'token-1',
      nowMs: 1_000,
      lifetimeMs: 15 * 60 * 1000,
    }),
  ).toStrictEqual({ code: 'NOT_FOUND', status: 404, reason: 'unknown approval' });
});
