import { expect, mock, test } from 'bun:test';
import type { Logger } from '@heynixie/logger';
import { createPlanLoginsHolder } from '../login/create-plan-logins-holder';
import { buildMockGatewayStatus, buildStubSpendGateway } from '../test-utils';
import { checkSpendStart } from './check-spend-start';

function setupTest() {
  const gateway = buildStubSpendGateway();
  const log = mock<Logger>(() => {});

  const options = {
    gateway,
    planLogins: createPlanLoginsHolder(),
    defaultZone: 'UTC',
    credentialCount: 0,
    pathProfileIDs: [],
    log,
  };

  return { gateway, log, options };
}

test('it reports the gateway answered when it answers with the default zone', async () => {
  const ctx = setupTest();

  const result = await checkSpendStart(ctx.options);

  expect(result).toBe('answered');
});

test('it refuses to start with a model credential and reads nothing', async () => {
  const ctx = setupTest();
  const started = checkSpendStart({ ...ctx.options, credentialCount: 2 });

  expect(started).rejects.toThrow(/model_credentials/u);

  await started.catch(() => {});

  expect(ctx.gateway.readStatus.mock.calls).toStrictEqual([]);
});

test('it refuses to start when the gateway zone differs from the default zone', () => {
  const ctx = setupTest();

  ctx.gateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: buildMockGatewayStatus({ zone: 'Europe/London' }),
  });

  expect(checkSpendStart(ctx.options)).rejects.toThrow(/Europe\/London/u);
});

test('it starts when the gateway gave no answer, and logs it', async () => {
  const ctx = setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const result = await checkSpendStart(ctx.options);

  expect([result, ctx.log.mock.calls[0]]).toStrictEqual([
    'unanswered',
    ['spend.gateway_unanswered', { reason: 'no answer' }, 'warn'],
  ]);
});

test('it holds the plan logins that the gateway reports at start', async () => {
  const ctx = setupTest();

  ctx.gateway.readChatGPTLogins.mockResolvedValue({
    kind: 'ok',
    value: { 'codex-plan': { status: 'needs_login', accountID: null, planType: null } },
  });

  await checkSpendStart(ctx.options);

  expect(ctx.options.planLogins.read()).toStrictEqual({
    state: 'read',
    routes: { 'codex-plan': { status: 'needs_login', accountID: null, planType: null } },
  });
});

test('it logs the lost mark of a gateway that answers with it standing, and starts', async () => {
  const ctx = setupTest();

  ctx.gateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: buildMockGatewayStatus({ lost: true }),
  });

  const result = await checkSpendStart(ctx.options);

  expect([result, ctx.log.mock.calls]).toStrictEqual([
    'answered',
    [['spend.gateway_lost', {}, 'warn']],
  ]);
});

test('it logs nothing of a gateway that answers with no lost mark', async () => {
  const ctx = setupTest();

  await checkSpendStart(ctx.options);

  expect(ctx.log.mock.calls).toStrictEqual([]);
});
