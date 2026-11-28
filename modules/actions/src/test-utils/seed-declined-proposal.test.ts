import { expect, test } from 'bun:test';
import { readActionProposals } from '@heynixie/policy';
import invariant from 'tiny-invariant';
import { createAllowedAction } from '../action/create-allowed-action';
import { buildMockLiftedCall } from './build-mock-lifted-call';
import { createTestStep } from './create-test-step';
import { seedDeclinedProposal } from './seed-declined-proposal';
import { startTestBudgetedActions } from './start-test-budgeted-actions';

function setupTest() {
  return startTestBudgetedActions();
}

test('it closes the proposal with the short ID as declined', async () => {
  const ctx = await setupTest();
  const first = await createTestStep(ctx.context);
  const second = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, buildMockLiftedCall(first, 6_000_000));

  const asked = await createAllowedAction(ctx.context, buildMockLiftedCall(second, 6_000_000));

  invariant('shortID' in asked);

  await seedDeclinedProposal(ctx.context, asked.shortID);

  const proposals = await readActionProposals(ctx.writer.db);

  expect(proposals.map((row) => [row.shortID, row.outcome])).toStrictEqual([
    [asked.shortID, 'declined'],
  ]);
});
