import { expect, test } from 'bun:test';
import { buildLoginFile } from '../test-utils/build-login-file';
import { pickLoginAfterRefresh } from './pick-login-after-refresh';

test('it stores the rotated refresh token and keeps the status time of an active login', () => {
  const held = buildLoginFile();

  expect(
    pickLoginAfterRefresh(
      held,
      { kind: 'token', accessToken: 'a', refreshToken: 'refresh-2' },
      2,
      '2026-11-14T10:00:00.000Z',
    ),
  ).toStrictEqual({
    failures: 0,
    login: { ...held, refreshToken: 'refresh-2', lastRefreshAt: '2026-11-14T10:00:00.000Z' },
  });
});

test('it keeps the stored refresh token when the answer rotated none', () => {
  const held = buildLoginFile();

  const picked = pickLoginAfterRefresh(
    held,
    { kind: 'token', accessToken: 'a', refreshToken: null },
    0,
    '2026-11-14T10:00:00.000Z',
  );

  expect(picked.login?.refreshToken).toBe('refresh-token-1');
});

test('it returns a failing login to active on a token', () => {
  const held = buildLoginFile({ status: 'failing', reason: 'service_error' });

  const picked = pickLoginAfterRefresh(
    held,
    { kind: 'token', accessToken: 'a', refreshToken: null },
    5,
    '2026-11-14T10:00:00.000Z',
  );

  expect(picked.login).toMatchObject({
    status: 'active',
    reason: null,
    statusSince: '2026-11-14T10:00:00.000Z',
  });
});

test('it marks a refused login as needing a login', () => {
  const picked = pickLoginAfterRefresh(
    buildLoginFile(),
    { kind: 'refused', code: 'invalid_grant' },
    0,
    '2026-11-14T10:00:00.000Z',
  );

  expect(picked.login).toMatchObject({
    status: 'needs_login',
    reason: 'refused',
    statusSince: '2026-11-14T10:00:00.000Z',
  });
});

test('it changes nothing for a refusal of a login that already needs a login', () => {
  const held = buildLoginFile({ status: 'needs_login', reason: 'refused' });

  expect(
    pickLoginAfterRefresh(
      held,
      { kind: 'refused', code: 'invalid_grant' },
      0,
      '2026-11-14T10:00:00.000Z',
    ).login,
  ).toBeNull();
});

test.each([0, 1])('it keeps a login active after %i earlier failures and this one', (failures) => {
  const picked = pickLoginAfterRefresh(
    buildLoginFile(),
    { kind: 'service_error' },
    failures,
    '2026-11-14T10:00:00.000Z',
  );

  expect(picked).toStrictEqual({ failures: failures + 1, login: null });
});

test.each([
  ['service_error', 'service_error'],
  ['no_answer', 'no_answer'],
] as const)('it marks a login failing from the third %s in a row', (kind, reason) => {
  const picked = pickLoginAfterRefresh(buildLoginFile(), { kind }, 2, '2026-11-14T10:00:00.000Z');

  expect(picked).toStrictEqual({
    failures: 3,
    login: {
      ...buildLoginFile(),
      status: 'failing',
      reason,
      statusSince: '2026-11-14T10:00:00.000Z',
    },
  });
});

test('it takes the reason of the last failure when the mix of failures changes', () => {
  const held = buildLoginFile({
    status: 'failing',
    reason: 'service_error',
    statusSince: '2026-11-14T09:00:00.000Z',
  });

  const picked = pickLoginAfterRefresh(held, { kind: 'no_answer' }, 3, '2026-11-14T10:00:00.000Z');

  expect(picked.login).toMatchObject({
    status: 'failing',
    reason: 'no_answer',
    statusSince: '2026-11-14T09:00:00.000Z',
  });
});

test('it writes nothing for a failure that repeats the failing reason', () => {
  const held = buildLoginFile({ status: 'failing', reason: 'service_error' });

  expect(
    pickLoginAfterRefresh(held, { kind: 'service_error' }, 4, '2026-11-14T10:00:00.000Z').login,
  ).toBeNull();
});
