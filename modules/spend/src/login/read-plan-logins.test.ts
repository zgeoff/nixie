import { expect, test } from 'bun:test';
import { startTestSpend } from '../test-utils';
import { readPlanLogins } from './read-plan-logins';

test('it reads the logins of the gateway and holds them', async () => {
  const ctx = await startTestSpend();

  ctx.gateway.readChatGPTLogins.mockResolvedValue({
    kind: 'ok',
    value: { 'codex-plan': { status: 'active', accountID: 'acct-test-1', planType: 'plus' } },
  });

  const logins = await readPlanLogins(ctx.context);

  expect([logins, ctx.context.planLogins.read()]).toStrictEqual([
    {
      state: 'read',
      routes: { 'codex-plan': { status: 'active', accountID: 'acct-test-1', planType: 'plus' } },
    },
    {
      state: 'read',
      routes: { 'codex-plan': { status: 'active', accountID: 'acct-test-1', planType: 'plus' } },
    },
  ]);
});

test('it holds unreachable after a failed read, in place of the logins it held before', async () => {
  const ctx = await startTestSpend();

  await readPlanLogins(ctx.context);

  ctx.gateway.readChatGPTLogins.mockResolvedValue({ kind: 'unreachable', reason: 'down' });

  const logins = await readPlanLogins(ctx.context);

  expect([logins, ctx.context.planLogins.read()]).toStrictEqual([
    { state: 'unreachable' },
    { state: 'unreachable' },
  ]);
});
