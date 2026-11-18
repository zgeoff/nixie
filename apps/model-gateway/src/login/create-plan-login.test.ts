import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@heynixie/logger';
import { waitForCondition } from '@heynixie/testing';
import { z } from 'zod';
import { buildLoginFile } from '../test-utils/build-login-file';
import { buildTestJWT } from '../test-utils/build-test-jwt';
import { createPlanLogin } from './create-plan-login';
import { readLoginFile } from './read-login-file';
import { writeLoginFile } from './write-login-file';

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'model-gateway-plan-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const loginPath = join(directory, 'plan.json');
  const routeKeyFile = join(directory, 'route-key');

  await writeFile(routeKeyFile, 'route-key-1\n');

  const startMs = Date.parse('2026-11-14T10:00:00Z');
  let current = startMs;
  const answers: Answer[] = [];
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const sleeps: { delayMs: number; wake: () => void }[] = [];
  let gate: Promise<void> | null = null;

  const open = () =>
    createPlanLogin({
      routeID: 'codex-plan',
      config: { file: loginPath, routeKeyFile },
      send: async (url, init) => {
        const text = await new Response(init.body).text();

        const body = z.record(z.string(), z.unknown()).parse(JSON.parse(text));

        requests.push({ url, body });

        const answer = answers.shift() ?? { status: 503, body: {} };
        const waiting = gate;

        gate = null;

        await waiting;

        // status 0 stands for no answer within the time
        if (answer.status === 0) {
          throw new Error('no answer');
        }

        return Response.json(answer.body, { status: answer.status });
      },
      now: () => current,
      sleep: (delayMs, signal) =>
        new Promise((resolve) => {
          sleeps.push({
            delayMs,
            wake: () => {
              resolve();
            },
          });

          signal.addEventListener('abort', () => {
            resolve();
          });
        }),
      log: mock<Logger>(() => {}),
    });

  return {
    startMs,
    loginPath,
    requests,
    sleeps,
    open,
    writeLogin: (overrides: Parameters<typeof buildLoginFile>[0] = {}) =>
      writeLoginFile(loginPath, buildLoginFile(overrides)),
    readFile: () => readLoginFile(loginPath),
    advance: (durationMs: number) => {
      current += durationMs;
    },

    // holds the answer to the next request until the returned function runs
    holdNextAnswer: () => {
      const held = Promise.withResolvers<void>();

      gate = held.promise;

      return () => {
        held.resolve();
      };
    },
    answer: (status: number, body: unknown) => {
      answers.push({ status, body });
    },

    // an answer that carries a token that expires `lifeMs` from now
    answerToken: (accessLabel: string, refreshToken: string, lifeMs: number | null) => {
      answers.push({
        status: 200,
        body: {
          access_token: buildTestJWT({
            jti: accessLabel,
            ...(lifeMs === null ? {} : { exp: (current + lifeMs) / 1000 }),
          }),
          refresh_token: refreshToken,
        },
      });
    },
  };
}

test('it fails to open on a route key file that holds no key', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.loginPath, '..', 'route-key'), '\n');

  expect(ctx.open()).rejects.toThrow(/holds no key/u);
});

test('it reads the route key trimmed', async () => {
  const ctx = await setupTest();
  const login = await ctx.open();

  expect(login.routeKey).toBe('route-key-1');
});

test('it refuses a request when the route has no login file', async () => {
  const ctx = await setupTest();
  const login = await ctx.open();
  const result = await login.admit();

  expect(result).toStrictEqual({
    kind: 'refused',
    message: expect.stringContaining('chatgpt-login'),
  });

  expect(ctx.requests).toHaveLength(0);
});

test.each(['failing', 'needs_login'] as const)(
  'it refuses a request on a %s login and sends nothing',
  async (status) => {
    const ctx = await setupTest();

    await ctx.writeLogin({ status, reason: status === 'failing' ? 'no_answer' : 'refused' });

    const login = await ctx.open();
    const result = await login.admit();

    expect(result).toMatchObject({ kind: 'refused' });
    expect(ctx.requests).toHaveLength(0);
  },
);

test('it refreshes on the first request, writes the rotated refresh token and admits the new token', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  ctx.answerToken('a1', 'refresh-token-2', 60 * 60_000);

  const login = await ctx.open();
  const admitted = await login.admit();

  expect(admitted).toStrictEqual({
    kind: 'ok',
    accessToken: expect.any(String),
    loginID: 'login-1',
  });

  expect(ctx.requests).toStrictEqual([
    {
      url: 'https://auth.openai.com/oauth/token',
      body: {
        grant_type: 'refresh_token',
        client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
        refresh_token: 'refresh-token-1',
      },
    },
  ]);

  const result = await ctx.readFile();

  expect(result).toStrictEqual(
    buildLoginFile({
      refreshToken: 'refresh-token-2',
      lastRefreshAt: new Date(ctx.startMs).toISOString(),
    }),
  );
});

test('it shares one refresh among requests that arrive together', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  ctx.answerToken('a1', 'refresh-token-2', 60 * 60_000);

  const login = await ctx.open();
  const admitted = await Promise.all([login.admit(), login.admit(), login.admit()]);

  expect(ctx.requests).toHaveLength(1);
  expect(new Set(admitted.map((one) => (one.kind === 'ok' ? one.accessToken : null))).size).toBe(1);
});

test('it admits a held token with no second refresh', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  ctx.answerToken('a1', 'refresh-token-2', 60 * 60_000);

  const login = await ctx.open();

  await login.admit();

  ctx.advance(10 * 60_000);

  await login.admit();

  expect(ctx.requests).toHaveLength(1);
});

test('it refreshes again once the access token is 5 minutes from its expiry', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  ctx.answerToken('a1', 'refresh-token-2', 20 * 60_000);
  ctx.answerToken('a2', 'refresh-token-3', 60 * 60_000);

  const login = await ctx.open();

  await login.admit();

  ctx.advance(14 * 60_000);

  await login.admit();

  expect(ctx.requests).toHaveLength(1);

  ctx.advance(60_000);

  await login.admit();

  expect(ctx.requests.map((request) => request.body['refresh_token'])).toStrictEqual([
    'refresh-token-1',
    'refresh-token-2',
  ]);
});

test('it refreshes at least every 7 days, whatever the token says', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  ctx.answerToken('a1', 'refresh-token-2', 30 * 24 * 60 * 60_000);
  ctx.answerToken('a2', 'refresh-token-3', 30 * 24 * 60 * 60_000);

  const login = await ctx.open();

  await login.admit();

  ctx.advance(7 * 24 * 60 * 60_000 - 60_000);

  await login.admit();

  expect(ctx.requests).toHaveLength(1);

  ctx.advance(60_000);

  await login.admit();

  expect(ctx.requests).toHaveLength(2);
});

test('it refreshes after an hour a token whose expiry it cannot read', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  ctx.answerToken('a1', 'refresh-token-2', null);
  ctx.answerToken('a2', 'refresh-token-3', null);

  const login = await ctx.open();

  await login.admit();

  ctx.advance(54 * 60_000);

  await login.admit();

  expect(ctx.requests).toHaveLength(1);

  ctx.advance(60_000);

  await login.admit();

  expect(ctx.requests).toHaveLength(2);
});

test('it keeps the stored refresh token when the answer rotates none', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  ctx.answer(200, { access_token: buildTestJWT({ exp: (ctx.startMs + 60 * 60_000) / 1000 }) });

  const login = await ctx.open();

  await login.admit();

  const file = await ctx.readFile();

  expect(file?.refreshToken).toBe('refresh-token-1');
});

test('it drops its token and refreshes with the new refresh token when a new login appears', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  ctx.answerToken('a1', 'refresh-token-2', 60 * 60_000);
  ctx.answerToken('b1', 'refresh-token-b2', 60 * 60_000);

  const login = await ctx.open();

  await login.admit();
  await ctx.writeLogin({ loginID: 'login-2', refreshToken: 'refresh-token-b1' });

  const admitted = await login.admit();

  expect(admitted).toMatchObject({ kind: 'ok', loginID: 'login-2' });

  expect(ctx.requests.map((request) => request.body['refresh_token'])).toStrictEqual([
    'refresh-token-1',
    'refresh-token-b1',
  ]);
});

test('it refuses a request once the login file is gone', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  ctx.answerToken('a1', 'refresh-token-2', 60 * 60_000);

  const login = await ctx.open();

  await login.admit();

  await rm(ctx.loginPath);

  const result = await login.admit();

  expect(result).toMatchObject({ kind: 'refused' });
});

test.each([
  'refresh_token_expired',
  'refresh_token_reused',
  'refresh_token_invalidated',
  'invalid_grant',
])(
  'it marks the login needing a login on a %s refusal, and the file keeps the earlier refresh token',
  async (code) => {
    const ctx = await setupTest();

    await ctx.writeLogin();

    ctx.answer(401, { error: code });

    const login = await ctx.open();
    const result = await login.admit();

    expect(result).toMatchObject({ kind: 'refused' });

    const result2 = await ctx.readFile();

    expect(result2).toStrictEqual(
      buildLoginFile({
        status: 'needs_login',
        reason: 'refused',
        statusSince: new Date(ctx.startMs).toISOString(),
      }),
    );
  },
);

test('it stops refreshing a login that needs a login until a new login appears', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  ctx.answer(401, { error: 'invalid_grant' });

  const login = await ctx.open();

  await login.admit();
  await login.admit();

  expect(ctx.requests).toHaveLength(1);
});

test('it counts a 429, a 200 with no access token and an unknown 4xx code as service errors, never as a refusal', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  ctx.answer(429, { error: 'invalid_grant' });
  ctx.answer(200, {});
  ctx.answer(400, { error: 'unknown' });

  const login = await ctx.open();

  await login.admit();
  await login.admit();
  await login.admit();

  const result = await ctx.readFile();

  expect(result).toMatchObject({ status: 'failing', reason: 'service_error' });
});

test('it marks the login failing from the third failure in a row', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  ctx.answer(503, {});
  ctx.answer(500, {});

  const login = await ctx.open();

  await login.admit();
  await login.admit();

  const file = await ctx.readFile();

  expect(file?.status).toBe('active');

  // the stand-in answers 503 once its queue is empty
  await login.admit();

  const result = await ctx.readFile();

  expect(result).toMatchObject({ status: 'failing', reason: 'service_error' });
});

test('it marks the login failing with the reason no_answer from the third refresh that gets no answer', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  ctx.answer(503, {});
  ctx.answer(0, null);
  ctx.answer(0, null);

  const login = await ctx.open();

  await login.admit();
  await login.admit();
  await login.admit();

  const result = await ctx.readFile();

  expect(result).toMatchObject({ status: 'failing', reason: 'no_answer' });
});

test('it returns a failing login to active on the first token of its retries', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin({ status: 'failing', reason: 'service_error' });

  ctx.answerToken('a1', 'refresh-token-2', 60 * 60_000);

  const login = await ctx.open();

  login.start();

  onTestFinished(() => login.stop());

  await waitForCondition(async () => {
    const file = await ctx.readFile();

    return file?.status === 'active';
  });

  const result = await ctx.readFile();

  expect(result).toMatchObject({ status: 'active', reason: null });
});

test('it retries a failing login with a growing backoff', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  const login = await ctx.open();

  login.start();

  onTestFinished(() => login.stop());

  await waitForCondition(() => ctx.sleeps.length === 1);

  ctx.sleeps[0]?.wake();

  await waitForCondition(() => ctx.sleeps.length === 2);

  ctx.sleeps[1]?.wake();

  await waitForCondition(() => ctx.sleeps.length === 3);

  expect(ctx.sleeps.map((sleep) => sleep.delayMs)).toStrictEqual([30_000, 60_000, 120_000]);
});

test('it refreshes at its start and again when the access token nears its expiry', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  ctx.answerToken('a1', 'refresh-token-2', 30 * 60_000);
  ctx.answerToken('a2', 'refresh-token-3', 30 * 60_000);

  const login = await ctx.open();

  login.start();

  onTestFinished(() => login.stop());

  await waitForCondition(() => ctx.sleeps.length === 1);

  expect(ctx.sleeps[0]?.delayMs).toBe(25 * 60_000);

  ctx.advance(25 * 60_000);
  ctx.sleeps[0]?.wake();

  await waitForCondition(() => ctx.requests.length === 2);

  expect(ctx.requests.map((request) => request.body['refresh_token'])).toStrictEqual([
    'refresh-token-1',
    'refresh-token-2',
  ]);
});

test('it starts no refresh after a 401 while its token is under 5 minutes old', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  ctx.answerToken('a1', 'refresh-token-2', 60 * 60_000);

  const login = await ctx.open();

  await login.admit();

  ctx.advance(4 * 60_000);

  await login.refreshAfterRejection('login-1');

  expect(ctx.requests).toHaveLength(1);
});

test('it starts a refresh after a 401 once its token is 5 minutes old', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  ctx.answerToken('a1', 'refresh-token-2', 60 * 60_000);
  ctx.answerToken('a2', 'refresh-token-3', 60 * 60_000);

  const login = await ctx.open();

  await login.admit();

  ctx.advance(5 * 60_000);

  await login.refreshAfterRejection('login-1');

  expect(ctx.requests).toHaveLength(2);
});

test('it starts no refresh after a 401 for a login it no longer holds', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  ctx.answerToken('a1', 'refresh-token-2', 60 * 60_000);

  const login = await ctx.open();

  await login.admit();

  ctx.advance(10 * 60_000);

  await login.refreshAfterRejection('login-0');

  expect(ctx.requests).toHaveLength(1);
});

test('it reports the entry of a login without its token or email', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  const login = await ctx.open();
  const result = await login.readEntry();

  expect(result).toStrictEqual({
    status: 'active',
    reason: null,
    since: '2026-11-13T09:12:00.000Z',
    accountID: 'acct-test-1',
    planType: 'plus',
  });
});

test('it makes a request wait for a refresh in flight before it admits a token', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  ctx.answerToken('a1', 'refresh-token-2', 60 * 60_000);

  const login = await ctx.open();

  await login.admit();

  ctx.advance(10 * 60_000);

  const release = ctx.holdNextAnswer();

  ctx.answerToken('a2', 'refresh-token-3', 60 * 60_000);

  const refreshing = login.refreshAfterRejection('login-1');

  await waitForCondition(() => ctx.requests.length === 2);

  let admittedEarly = false;

  const admitting = (async () => {
    const result = await login.admit();

    admittedEarly = true;

    return result;
  })();

  await expect(waitForCondition(() => admittedEarly, { timeoutMs: 100 })).toReject();

  release();

  await refreshing;

  const admitted = await admitting;

  expect(admitted).toStrictEqual({
    kind: 'ok',
    accessToken: expect.any(String),
    loginID: 'login-1',
  });

  const file = await ctx.readFile();

  expect(file?.refreshToken).toBe('refresh-token-3');
});

test('it refuses a request and sends nothing upstream once the third failed refresh marks the login failing', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin();

  ctx.answerToken('a1', 'refresh-token-2', 20 * 60_000);

  const login = await ctx.open();

  await login.admit();

  ctx.advance(16 * 60_000);

  // the stand-in answers 503 once its queue is empty
  await login.admit();
  await login.admit();

  const file = await ctx.readFile();

  expect(file?.status).toBe('active');

  const result = await login.admit();
  const failing = await ctx.readFile();

  expect(failing?.status).toBe('failing');
  expect(result).toStrictEqual({ kind: 'refused', message: expect.stringContaining('failing') });
});
