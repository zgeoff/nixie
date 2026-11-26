import { expect, mock, onTestFinished, test } from 'bun:test';
import { makeKeyedFetch } from '@heynixie/egress/test-utils';
import { startTestModelGateway } from '@heynixie/model-gateway/test-utils';
import {
  patchLimitUntilSet,
  pickSandboxLimit,
  withSandboxLimitLock,
  writeSandboxLimit,
} from '@heynixie/spend';
import { createSpendGateway } from '@heynixie/spend-model-gateway';
import { startScriptedModel } from '@heynixie/testing';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';

async function setupTest() {
  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  const gateway = await startTestModelGateway({
    upstreamURL: model.url,
    periods: {
      zone: 'UTC',
      countBySandbox: true,
      providerLimits: { day: 100, month: 1000 },
      secondRoute: { id: 'bare', limits: null },
    },
    planRoute: {
      routeID: 'codex-plan',
      login: {
        version: 1,
        loginID: 'login-1',
        refreshToken: 'refresh-token-1',
        accountID: 'acct-test-1',
        planType: 'plus',
        email: 'owner@example.com',
        status: 'active',
        reason: null,
        statusSince: '2026-11-13T09:12:00.000Z',
        lastRefreshAt: null,
      },
    },
  });

  return {
    control: gateway.control,
    spend: createSpendGateway({
      url: gateway.control.url,
      fetch: makeKeyedFetch('authorization', `Bearer ${gateway.control.token}`),
    }),
  };
}

test('it reads the status of each provider and each route with its limit and its cap', async () => {
  const ctx = await setupTest();
  const status = await ctx.spend.readStatus();

  expect(status).toStrictEqual({
    kind: 'ok',
    value: {
      zone: 'UTC',
      lost: false,
      providers: {
        test: {
          day: {
            start: expect.toBeString(),
            resetsAt: expect.toBeString(),
            dollars: 0,
            limit: 100,
            cap: 200,
            tripped: false,
            sinceMs: null,
          },
          month: expect.objectContaining({ limit: 1000, cap: null }),
        },
      },
      routes: {
        'codex-plan': expect.objectContaining({ provider: 'test' }),
        bare: expect.objectContaining({
          provider: 'test',
          day: expect.objectContaining({ limit: null, cap: null, tripped: false }),
        }),
        scripted: {
          provider: 'test',
          day: {
            start: expect.toBeString(),
            resetsAt: expect.toBeString(),
            dollars: 0,
            limit: 100,
            cap: 200,
            tripped: false,
            sinceMs: null,
          },
          month: {
            start: expect.toBeString(),
            resetsAt: expect.toBeString(),
            dollars: 0,
            limit: 1000,
            cap: null,
            tripped: false,
            sinceMs: null,
          },
        },
      },
    },
  });
});

test('it raises the day of a route for its start', async () => {
  const ctx = await setupTest();
  const status = await ctx.spend.readStatus();

  invariant(status.kind === 'ok');

  const day = status.value.routes['scripted']?.day;

  invariant(day !== undefined);

  const raised = await ctx.spend.postRaise({
    target: { kind: 'route', id: 'scripted' },
    start: day.start,
    dollars: 150,
  });

  invariant(raised.kind === 'ok');

  expect(raised.value.routes['scripted']?.day.limit).toBe(150);
});

test('it returns above_cap with the route and its cap for a raise past the cap', async () => {
  const ctx = await setupTest();
  const status = await ctx.spend.readStatus();

  invariant(status.kind === 'ok');

  const day = status.value.routes['scripted']?.day;

  invariant(day !== undefined);

  const raised = await ctx.spend.postRaise({
    target: { kind: 'route', id: 'scripted' },
    start: day.start,
    dollars: 999,
  });

  expect(raised).toStrictEqual({
    kind: 'above_cap',
    route: 'scripted',
    provider: null,
    cap: 200,
  });
});

test('it returns period_ended for a raise of another start', async () => {
  const ctx = await setupTest();

  const raised = await ctx.spend.postRaise({
    target: { kind: 'route', id: 'scripted' },
    start: '2000-01-01',
    dollars: 90,
  });

  expect(raised).toStrictEqual({ kind: 'period_ended' });
});

test('it raises the day of a provider and names the provider when the raise is past its cap', async () => {
  const ctx = await setupTest();
  const status = await ctx.spend.readStatus();

  invariant(status.kind === 'ok');

  const day = status.value.providers['test']?.day;

  invariant(day !== undefined);

  const target = { kind: 'provider', id: 'test' } as const;

  const raised = await ctx.spend.postRaise({ target, start: day.start, dollars: 150 });
  const past = await ctx.spend.postRaise({ target, start: day.start, dollars: 201 });

  invariant(raised.kind === 'ok');

  expect([raised.value.providers['test']?.day.limit, past]).toStrictEqual([
    150,
    { kind: 'above_cap', route: null, provider: 'test', cap: 200 },
  ]);
});

test('it answers not_found for a raise of a provider the gateway lacks, and no_route_limit for a route with no limit of its own', async () => {
  const ctx = await setupTest();
  const status = await ctx.spend.readStatus();

  invariant(status.kind === 'ok');

  const start = status.value.providers['test']?.day.start ?? '';

  const ghost = await ctx.spend.postRaise({
    target: { kind: 'provider', id: 'ghost' },
    start,
    dollars: 5,
  });

  const bare = await ctx.spend.postRaise({
    target: { kind: 'route', id: 'bare' },
    start,
    dollars: 5,
  });

  expect([ghost, bare]).toStrictEqual([
    { kind: 'not_found' },
    { kind: 'no_route_limit', route: 'bare' },
  ]);
});

test('it sets the count of a provider with a count change, and answers period_ended for another start', async () => {
  const ctx = await setupTest();
  const status = await ctx.spend.readStatus();

  invariant(status.kind === 'ok');

  const start = status.value.providers['test']?.day.start ?? '';
  const target = { kind: 'provider', id: 'test' } as const;

  const set = await ctx.spend.postCount({ target, period: 'day', start, dollars: 0 });

  const ended = await ctx.spend.postCount({
    target,
    period: 'day',
    start: '2000-01-01',
    dollars: 0,
  });

  const ghost = await ctx.spend.postCount({
    target: { kind: 'route', id: 'ghost' },
    period: 'day',
    start,
    dollars: 0,
  });

  expect([set, ended, ghost]).toStrictEqual([
    { kind: 'ok' },
    { kind: 'period_ended' },
    { kind: 'not_found' },
  ]);
});

test('it registers, reads and removes a sandbox', async () => {
  const ctx = await setupTest();
  const put = await ctx.spend.putSandbox('nixie-abc', { dollars: 2, tokens: 2000 });
  const read = await ctx.spend.readSandbox('nixie-abc');
  const removed = await ctx.spend.removeSandbox('nixie-abc');
  const after = await ctx.spend.readSandbox('nixie-abc');

  expect(put).toStrictEqual({ kind: 'ok' });

  expect(read).toStrictEqual({
    kind: 'ok',
    value: { dollars: 0, tokens: 0, tripped: false, lastRefusal: null, limitRevision: 1 },
  });

  expect(removed).toStrictEqual({ kind: 'ok' });
  expect(after).toStrictEqual({ kind: 'not_found' });
});

test('it registers a sandbox as count only', async () => {
  const ctx = await setupTest();
  const put = await ctx.spend.putSandbox('nixie-abc', null);

  expect(put).toStrictEqual({ kind: 'ok' });
});

test('it patches the limit of a sandbox and answers not_found for one the gateway lacks', async () => {
  const ctx = await setupTest();

  await ctx.spend.putSandbox('nixie-abc', null);

  const patched = await ctx.spend.patchSandbox('nixie-abc', { dollars: 0.000001 });
  const lacking = await ctx.spend.patchSandbox('nixie-none', { dollars: 1 });

  expect(patched).toStrictEqual({ kind: 'ok' });
  expect(lacking).toStrictEqual({ kind: 'not_found' });
});

test('it takes a limit of zero dollars for a sandbox that has the whole of its task run reserved', async () => {
  const ctx = await setupTest();

  await ctx.spend.putSandbox('nixie-abc', null);

  const patched = await ctx.spend.patchSandbox(
    'nixie-abc',
    pickSandboxLimit({ startMicros: 0, leftDollars: 0 }),
  );

  const read = await ctx.spend.readSandbox('nixie-abc');

  expect(patched).toStrictEqual({ kind: 'ok' });

  expect(read).toStrictEqual({
    kind: 'ok',
    value: { dollars: 0, tokens: 0, tripped: true, lastRefusal: null, limitRevision: 2 },
  });
});

test('it keeps a newer limit when a raise call that timed out reaches the gateway after it', async () => {
  const ctx = await setupTest();

  const keyed = makeKeyedFetch('authorization', `Bearer ${ctx.control.token}`);
  const held = Promise.withResolvers<() => Promise<Response>>();

  const sendOrHoldRaise = (input: string, init?: RequestInit): Promise<Response> => {
    if (
      init?.method === 'PATCH' &&
      typeof init.body === 'string' &&
      init.body.includes('"dollars":4')
    ) {
      const { signal: _, ...unbounded } = init;

      held.resolve(() => keyed(input, unbounded));

      return Promise.reject(new DOMException('The operation timed out.', 'TimeoutError'));
    }

    return keyed(input, init);
  };

  const spend = createSpendGateway({ url: ctx.control.url, fetch: sendOrHoldRaise });
  const clock = createFakeClock();

  const stopped = new AbortController();

  await spend.putSandbox('nixie-abc', null);

  const raising = patchLimitUntilSet(
    { gateway: spend, clock },
    { sandbox: 'nixie-abc', readLimit: () => Promise.resolve({ limit: { dollars: 4 } }) },
    { retryMs: 5000, logger: () => {}, signal: stopped.signal },
  );

  const sendLate = await held.promise;

  await withSandboxLimitLock('nixie-abc', () =>
    writeSandboxLimit(spend, 'nixie-abc', pickSandboxLimit({ startMicros: 0, leftDollars: 0 })),
  );

  const late = await sendLate();

  stopped.abort();

  await raising;

  const read = await spend.readSandbox('nixie-abc');

  expect(late.status).toBe(409);

  expect(read).toStrictEqual({
    kind: 'ok',
    value: {
      dollars: 0,
      tokens: 0,
      tripped: true,
      lastRefusal: null,
      limitRevision: expect.toBeNumber(),
    },
  });
});

test('it removes a sandbox that the gateway lacks', async () => {
  const ctx = await setupTest();
  const answer = await ctx.spend.removeSandbox('nixie-none');

  expect(answer).toStrictEqual({ kind: 'ok' });
});

test('it returns unreachable with the status for a wrong token', async () => {
  const ctx = await setupTest();

  const spend = createSpendGateway({
    url: ctx.control.url,
    fetch: makeKeyedFetch('authorization', 'Bearer wrong'),
  });

  const answer = await spend.readStatus();

  expect(answer).toStrictEqual({
    kind: 'unreachable',
    reason: 'the gateway answered 401',
  });
});

test('it returns unreachable for a sandbox call with a wrong token', async () => {
  const ctx = await setupTest();

  const spend = createSpendGateway({
    url: ctx.control.url,
    fetch: makeKeyedFetch('authorization', 'Bearer wrong'),
  });

  const answer = await spend.putSandbox('nixie-abc', null);

  expect(answer).toStrictEqual({
    kind: 'unreachable',
    reason: 'the gateway answered 401',
  });
});

test('it returns unreachable when nothing listens at the address', async () => {
  const answerEmpty = mock(() => new Response(''));
  const closed = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: answerEmpty });
  const url = `http://127.0.0.1:${String(closed.port)}`;

  await closed.stop(true);

  const spend = createSpendGateway({
    url,
    fetch: makeKeyedFetch('authorization', 'Bearer any'),
    timeoutMs: 1000,
  });

  const answer = await spend.readStatus();

  expect(answer).toStrictEqual({
    kind: 'unreachable',
    reason: expect.toBeString(),
  });
});

test('it returns unreachable when the listener sends a reply that is not the gateway status', async () => {
  const answerOtherReply = mock(() => Response.json({ hello: 'world' }));
  const other = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: answerOtherReply });

  onTestFinished(() => other.stop(true));

  const spend = createSpendGateway({
    url: `http://127.0.0.1:${String(other.port)}`,
    fetch: makeKeyedFetch('authorization', 'Bearer any'),
  });

  const answer = await spend.readStatus();

  expect(answer).toStrictEqual({
    kind: 'unreachable',
    reason: 'the gateway sent a reply that is not its own',
  });
});

test('it reads the plan logins of the gateway without a token or an email', async () => {
  const ctx = await setupTest();
  const logins = await ctx.spend.readChatGPTLogins();

  expect(logins).toStrictEqual({
    kind: 'ok',
    value: { 'codex-plan': { status: 'active', accountID: 'acct-test-1', planType: 'plus' } },
  });
});

test('it reads the plan logins as unreachable when the token is wrong', async () => {
  const ctx = await setupTest();

  const spend = createSpendGateway({
    url: ctx.control.url,
    fetch: makeKeyedFetch('authorization', 'Bearer wrong'),
  });

  const logins = await spend.readChatGPTLogins();

  expect(logins).toStrictEqual({ kind: 'unreachable', reason: 'the gateway answered 401' });
});
