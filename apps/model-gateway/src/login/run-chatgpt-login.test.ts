import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLoginFile } from '../test-utils/build-login-file';
import { buildTestIDToken } from '../test-utils/build-test-id-token';
import { buildTestJWT } from '../test-utils/build-test-jwt';
import { readLoginFile } from './read-login-file';
import { runChatGPTLogin } from './run-chatgpt-login';
import { writeLoginFile } from './write-login-file';

interface Call {
  readonly url: string;
  readonly body: string;
}

interface PendingPolls {
  left: number;
}

interface RunOptions {
  readonly pendingPolls: number;
  readonly codeStatus?: number;
}

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'model-gateway-chatgpt-login-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const loginPath = join(directory, 'logins', 'plan.json');
  const calls: Call[] = [];
  const output: string[] = [];
  let current = Date.parse('2026-11-14T10:00:00Z');
  const sleeps: number[] = [];

  // the secrets the stand-in flow hands out, built at run time
  const secrets = {
    refresh: `refresh-${crypto.randomUUID()}`,
    access: buildTestJWT({ jti: crypto.randomUUID() }),
    id: buildTestIDToken({
      accountID: 'acct-test-7',
      planType: 'plus',
      email: 'owner@example.com',
    }),
    code: `code-${crypto.randomUUID()}`,
    verifier: `verifier-${crypto.randomUUID()}`,
  };

  const respond = (url: string, pendingPolls: PendingPolls, codeStatus: number): Response => {
    if (url.endsWith('/deviceauth/usercode')) {
      return codeStatus === 200
        ? Response.json({ device_auth_id: 'device-1', user_code: 'ABCD-1234', interval: '5' })
        : new Response('{}', { status: codeStatus });
    }

    if (url.endsWith('/deviceauth/token')) {
      if (pendingPolls.left > 0) {
        pendingPolls.left -= 1;

        return new Response('{}', { status: pendingPolls.left % 2 === 0 ? 403 : 404 });
      }

      return Response.json({
        authorization_code: secrets.code,
        code_challenge: 'challenge',
        code_verifier: secrets.verifier,
      });
    }

    return Response.json({
      id_token: secrets.id,
      access_token: secrets.access,
      refresh_token: secrets.refresh,
    });
  };

  const run = (options: RunOptions) => {
    const pending = { left: options.pendingPolls };

    return runChatGPTLogin({
      routeID: 'codex-plan',
      loginPath,
      send: (url, init) => {
        calls.push({ url, body: String(init.body) });

        return Promise.resolve(respond(url, pending, options.codeStatus ?? 200));
      },
      write: (text) => {
        output.push(text);
      },
      now: () => current,
      sleep: (delayMs) => {
        sleeps.push(delayMs);

        current += delayMs;

        return Promise.resolve();
      },
    });
  };

  return { loginPath, calls, output, sleeps, secrets, run };
}

test('it signs in, writes the login file with a new ID, and prints the email and plan', async () => {
  const ctx = await setupTest();
  const isSignedIn = await ctx.run({ pendingPolls: 2 });

  expect(isSignedIn).toBeTrue();

  expect(ctx.output.join('')).toBe(
    'Open https://auth.openai.com/codex/device and enter the code ABCD-1234 (expires in 15 minutes).\n' +
      'Signed in: owner@example.com, plan plus. Stored for codex-plan.\n',
  );

  const result = await readLoginFile(ctx.loginPath);

  expect(result).toStrictEqual({
    version: 1,
    loginID: expect.any(String),
    refreshToken: ctx.secrets.refresh,
    accountID: 'acct-test-7',
    planType: 'plus',
    email: 'owner@example.com',
    status: 'active',
    reason: null,
    statusSince: '2026-11-14T10:00:10.000Z',
    lastRefreshAt: '2026-11-14T10:00:10.000Z',
  });
});

test('it polls every interval the code request names until the code is approved', async () => {
  const ctx = await setupTest();

  await ctx.run({ pendingPolls: 2 });

  expect(ctx.sleeps).toStrictEqual([5000, 5000]);
});

test('it sends the code request, the poll and the exchange the pinned CLI sends', async () => {
  const ctx = await setupTest();

  await ctx.run({ pendingPolls: 0 });

  expect(ctx.calls).toStrictEqual([
    {
      url: 'https://auth.openai.com/api/accounts/deviceauth/usercode',
      body: '{"client_id":"app_EMoamEEZ73f0CkXaXp7hrann"}',
    },
    {
      url: 'https://auth.openai.com/api/accounts/deviceauth/token',
      body: '{"device_auth_id":"device-1","user_code":"ABCD-1234"}',
    },
    {
      url: 'https://auth.openai.com/oauth/token',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
        code: ctx.secrets.code,
        redirect_uri: 'https://auth.openai.com/deviceauth/callback',
        code_verifier: ctx.secrets.verifier,
      }).toString(),
    },
  ]);
});

test('it prints no token, code or verifier', async () => {
  const ctx = await setupTest();

  await ctx.run({ pendingPolls: 1 });

  const output = ctx.output.join('');

  expect(Object.values(ctx.secrets).filter((secret) => output.includes(secret))).toStrictEqual([]);
});

test('it replaces the login file the route had', async () => {
  const ctx = await setupTest();

  await writeLoginFile(
    ctx.loginPath,
    buildLoginFile({ loginID: 'earlier', status: 'needs_login', reason: 'refused' }),
  );

  await ctx.run({ pendingPolls: 0 });

  const result = await readLoginFile(ctx.loginPath);

  expect(result).toMatchObject({
    status: 'active',
    loginID: expect.not.stringMatching(/^earlier$/u),
  });
});

test('it says device code login is off on a 404 for the code request, and writes no file', async () => {
  const ctx = await setupTest();
  const isSignedIn = await ctx.run({ pendingPolls: 0, codeStatus: 404 });

  expect(isSignedIn).toBeFalse();
  expect(ctx.output.join('')).toContain("ChatGPT's security settings");

  const result = await readLoginFile(ctx.loginPath);

  expect(result).toBeNull();
});

test('it gives up when nobody approves the code in 15 minutes', async () => {
  const ctx = await setupTest();
  const isSignedIn = await ctx.run({ pendingPolls: 1000 });

  expect(isSignedIn).toBeFalse();
  expect(ctx.output.join('')).toContain('expired');

  const result = await readLoginFile(ctx.loginPath);

  expect(result).toBeNull();
});

test('it fails on a code request that OpenAI refuses for another reason', async () => {
  const ctx = await setupTest();

  await expect(ctx.run({ pendingPolls: 0, codeStatus: 500 })).rejects.toThrow(/status 500/u);
});
