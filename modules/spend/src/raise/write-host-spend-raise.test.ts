import { expect, test } from 'bun:test';
import { readPause, withWriteTransaction } from '@heynixie/log';
import { checkSpendTurns } from '../gate/check-spend-turns';
import { readSpendRaise } from '../stop/read-spend-raise';
import { readSpendStopRow } from '../stop/read-spend-stop-row';
import { startTestSpend } from '../test-utils';
import { writeHostSpendRaise } from './write-host-spend-raise';

async function setupTest() {
  const spend = await startTestSpend({ dayTurns: 3, dayTurnCap: 5, monthTurns: 100 });

  return {
    ...spend,
    raise: (turns: number) => writeHostSpendRaise(spend.context, { turns }),
    checkTurns: () => checkSpendTurns(spend.context),
  };
}

test('it lifts the turns above the day turn cap and clears a turn stop', async () => {
  const ctx = await setupTest();

  for (let turn = 0; turn < 6; turn += 1) {
    await ctx.writeTurn();
  }

  await ctx.checkTurns();

  const raised = await ctx.raise(9);
  const row = await readSpendStopRow(ctx.writer.db);
  const paused = await withWriteTransaction(ctx.writer, (tx) => readPause(tx));
  const stored = await readSpendRaise(ctx.writer.db, '2026-10-16');

  expect(raised).toStrictEqual({ start: '2026-10-16', turns: 9 });
  expect([row, paused]).toStrictEqual([null, null]);
  expect(stored).toStrictEqual({ turns: 9, by: 'host' });
});

test('it keeps the larger turns when a later raise holds fewer', async () => {
  const ctx = await setupTest();

  await ctx.raise(9);
  await ctx.raise(4);

  const stored = await readSpendRaise(ctx.writer.db, '2026-10-16');

  expect(stored).toStrictEqual({ turns: 9, by: 'host' });
});

test('it holds the plan logins that the gateway reports', async () => {
  const ctx = await setupTest();

  ctx.gateway.readChatGPTLogins.mockResolvedValue({
    kind: 'ok',
    value: { 'codex-plan': { status: 'active', accountID: 'acct-test-1', planType: 'plus' } },
  });

  await ctx.raise(9);

  expect(ctx.context.planLogins.read()).toStrictEqual({
    state: 'read',
    routes: { 'codex-plan': { status: 'active', accountID: 'acct-test-1', planType: 'plus' } },
  });
});
