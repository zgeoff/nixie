import { expect, test } from 'bun:test';
import { readActionProposals } from '@heynixie/policy';
import { seedDeclinedBuy } from './seed-declined-buy';
import { startTestBudgetedActions } from './start-test-budgeted-actions';

function setupTest() {
  return startTestBudgetedActions();
}

test('it leaves one declined proposal on the task of an open run', async () => {
  const ctx = await setupTest();
  const declined = await seedDeclinedBuy(ctx);
  const proposals = await readActionProposals(ctx.writer.db);

  expect(proposals.map((row) => [row.shortID, row.thread, row.outcome])).toStrictEqual([
    [declined.shortID, declined.taskID, 'declined'],
  ]);
});
