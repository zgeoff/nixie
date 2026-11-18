import { expect, mock, test } from 'bun:test';
import type { Logger } from '@heynixie/logger';
import { createPlanLoginsHolder } from '../login/create-plan-logins-holder';
import { buildMockGatewayStatus, buildStubSpendGateway } from '../test-utils';
import { startSpendLimits } from './start-spend-limits';

function setupTest() {
  const limits = {
    day: { dollars: 60, tokens: 80_000_000 },
    month: { dollars: 600, tokens: 600_000_000 },
  };

  const gateway = buildStubSpendGateway();
  const log = mock<Logger>(() => {});

  const options = {
    gateway,
    planLogins: createPlanLoginsHolder(),
    limits,
    defaultZone: 'UTC',
    credentialCount: 0,
    pathProfileIDs: [],
    log,
  };

  return { gateway, log, limits, options };
}

test('it sends the limits when the gateway answers with the default zone', async () => {
  const ctx = setupTest();

  await startSpendLimits(ctx.options);

  expect(ctx.gateway.putLimits.mock.calls).toStrictEqual([[ctx.limits]]);
});

test('it refuses to start with a model credential and sends nothing', async () => {
  const ctx = setupTest();
  const started = startSpendLimits({ ...ctx.options, credentialCount: 2 });

  expect(started).rejects.toThrow(/model_credentials/u);

  await started.catch(() => {});

  expect(ctx.gateway.readStatus.mock.calls).toStrictEqual([]);
});

test('it refuses to start when the gateway zone differs from the default zone', async () => {
  const ctx = setupTest();

  ctx.gateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: buildMockGatewayStatus({ zone: 'Europe/London' }),
  });

  const started = startSpendLimits(ctx.options);

  expect(started).rejects.toThrow(/Europe\/London/u);

  await started.catch(() => {});

  expect(ctx.gateway.putLimits.mock.calls).toStrictEqual([]);
});

test('it refuses to start with the cap in the error when the gateway refuses the limits', () => {
  const ctx = setupTest();

  ctx.gateway.putLimits.mockResolvedValue({
    kind: 'above_cap',
    period: 'day',
    cap: { dollars: 50, tokens: 1000 },
  });

  expect(startSpendLimits(ctx.options)).rejects.toThrow(/cap of 50 dollars and 1000 tokens/u);
});

test('it starts with the limits unsent when the gateway gave no answer', async () => {
  const ctx = setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const result = await startSpendLimits(ctx.options);

  expect([result, ctx.gateway.putLimits.mock.calls, ctx.log.mock.calls[0]]).toStrictEqual([
    'unsent',
    [],
    ['spend.limits_unsent', { reason: 'no answer' }, 'warn'],
  ]);
});

test('it reports the limits sent when the gateway answers', async () => {
  const ctx = setupTest();

  const result = await startSpendLimits(ctx.options);

  expect(result).toBe('sent');
});

test('it holds the plan logins that the gateway reports at start', async () => {
  const ctx = setupTest();

  ctx.gateway.readChatGPTLogins.mockResolvedValue({
    kind: 'ok',
    value: { 'codex-plan': { status: 'needs_login', accountID: null, planType: null } },
  });

  await startSpendLimits(ctx.options);

  expect(ctx.options.planLogins.read()).toStrictEqual({
    state: 'read',
    routes: { 'codex-plan': { status: 'needs_login', accountID: null, planType: null } },
  });
});
