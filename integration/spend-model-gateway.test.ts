import { expect, mock, onTestFinished, test } from 'bun:test';
import { startTestModelGateway } from '@heynixie/model-gateway/test-utils';
import { createSpendGateway } from '@heynixie/spend-model-gateway';
import { startScriptedModel } from '@heynixie/testing';
import invariant from 'tiny-invariant';

async function setupTest() {
  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  const gateway = await startTestModelGateway({
    upstreamURL: model.url,
    periods: { zone: 'UTC', countBySandbox: true },
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

  invariant(gateway.control);

  return {
    control: gateway.control,
    spend: createSpendGateway({ url: gateway.control.url, token: gateway.control.token }),
  };
}

test('it reads the status of a gateway that holds no limit', async () => {
  const ctx = await setupTest();
  const status = await ctx.spend.readStatus();

  expect(status).toStrictEqual({
    kind: 'ok',
    value: {
      zone: 'UTC',
      lost: false,
      periods: {
        day: {
          start: expect.toBeString(),
          resetsAt: expect.toBeString(),
          spent: { dollars: 0, tokens: 0 },
          limit: null,
          cap: { dollars: 120, tokens: 160_000_000 },
        },
        month: {
          start: expect.toBeString(),
          resetsAt: expect.toBeString(),
          spent: { dollars: 0, tokens: 0 },
          limit: null,
          cap: { dollars: 1200, tokens: 1_200_000_000 },
        },
      },
      tripped: null,
    },
  });
});

test('it sets the limits that the status then shows in force', async () => {
  const ctx = await setupTest();

  const limits = {
    day: { dollars: 60, tokens: 80_000_000 },
    month: { dollars: 600, tokens: 600_000_000 },
  };

  const put = await ctx.spend.putLimits(limits);
  const status = await ctx.spend.readStatus();

  invariant(status.kind === 'ok');

  expect(put.kind).toBe('ok');
  expect(status.value.periods.day.limit).toStrictEqual(limits.day);
});

test('it returns above_cap with the cap for a limit past it', async () => {
  const ctx = await setupTest();

  const put = await ctx.spend.putLimits({
    month: { dollars: 600, tokens: 600_000_000 },
    day: { dollars: 500, tokens: 80_000_000 },
  });

  expect(put).toStrictEqual({
    kind: 'above_cap',
    period: 'day',
    cap: { dollars: 120, tokens: 160_000_000 },
  });
});

test('it raises the day for its start', async () => {
  const ctx = await setupTest();

  await ctx.spend.putLimits({
    day: { dollars: 60, tokens: 80_000_000 },
    month: { dollars: 600, tokens: 600_000_000 },
  });

  const status = await ctx.spend.readStatus();

  invariant(status.kind === 'ok');

  const raised = await ctx.spend.postRaise({
    start: status.value.periods.day.start,
    limit: { dollars: 90, tokens: 120_000_000 },
  });

  expect(raised.kind).toBe('ok');
});

test('it returns above_cap for a raise past the cap', async () => {
  const ctx = await setupTest();
  const status = await ctx.spend.readStatus();

  invariant(status.kind === 'ok');

  const raised = await ctx.spend.postRaise({
    start: status.value.periods.day.start,
    limit: { dollars: 999, tokens: 1 },
  });

  expect(raised).toStrictEqual({
    kind: 'above_cap',
    period: 'day',
    cap: { dollars: 120, tokens: 160_000_000 },
  });
});

test('it returns period_ended for a raise of another start', async () => {
  const ctx = await setupTest();

  const raised = await ctx.spend.postRaise({
    start: '2000-01-01',
    limit: { dollars: 90, tokens: 1 },
  });

  expect(raised).toStrictEqual({ kind: 'period_ended' });
});

test('it registers, reads and removes a sandbox', async () => {
  const ctx = await setupTest();
  const put = await ctx.spend.putSandbox('nixie-abc', { dollars: 2, tokens: 2000 });
  const read = await ctx.spend.readSandbox('nixie-abc');
  const removed = await ctx.spend.removeSandbox('nixie-abc');
  const after = await ctx.spend.readSandbox('nixie-abc');

  expect(put).toStrictEqual({ kind: 'ok' });
  expect(read).toStrictEqual({ kind: 'ok', value: { dollars: 0, tokens: 0, tripped: false } });
  expect(removed).toStrictEqual({ kind: 'ok' });
  expect(after).toStrictEqual({ kind: 'not_found' });
});

test('it registers a sandbox as count only', async () => {
  const ctx = await setupTest();
  const put = await ctx.spend.putSandbox('nixie-abc', null);

  expect(put).toStrictEqual({ kind: 'ok' });
});

test('it removes a sandbox that the gateway lacks', async () => {
  const ctx = await setupTest();
  const answer = await ctx.spend.removeSandbox('nixie-none');

  expect(answer).toStrictEqual({ kind: 'ok' });
});

test('it returns unreachable with the status for a wrong token', async () => {
  const ctx = await setupTest();

  const spend = createSpendGateway({ url: ctx.control.url, token: 'wrong' });

  const answer = await spend.readStatus();

  expect(answer).toStrictEqual({
    kind: 'unreachable',
    reason: 'the gateway answered 401',
  });
});

test('it returns unreachable for a sandbox call with a wrong token', async () => {
  const ctx = await setupTest();

  const spend = createSpendGateway({ url: ctx.control.url, token: 'wrong' });

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

  const spend = createSpendGateway({ url, token: 'any', timeoutMs: 1000 });

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

  const spend = createSpendGateway({ url: `http://127.0.0.1:${String(other.port)}`, token: 'any' });

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

  const spend = createSpendGateway({ url: ctx.control.url, token: 'wrong' });

  const logins = await spend.readChatGPTLogins();

  expect(logins).toStrictEqual({ kind: 'unreachable', reason: 'the gateway answered 401' });
});
