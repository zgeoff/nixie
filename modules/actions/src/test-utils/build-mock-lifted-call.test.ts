import { expect, test } from 'bun:test';
import { buildMockLiftedCall } from './build-mock-lifted-call';
import { createTestStep } from './create-test-step';
import { startTestActions } from './start-test-actions';

test('#buildMockLiftedCall carries the lift for the amount, in dollars in the arguments', async () => {
  const actions = await startTestActions();
  const step = await createTestStep(actions.context);

  const call = buildMockLiftedCall(step, 4_500_000);

  expect(call).toMatchObject({
    arguments: { amount: 4.5 },
    decision: { lift: { budgetID: 'groceries', amountMicros: 4_500_000 } },
  });
});
