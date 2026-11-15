import { expect, test } from 'bun:test';
import { createTestStep } from './create-test-step';
import { readTestAction } from './read-test-action';
import { seedAction } from './seed-action';
import { seedActionRiskClass } from './seed-action-risk-class';
import { startTestActions } from './start-test-actions';

function setupTest() {
  return startTestActions();
}

test('it puts an action in the given risk class', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const seeded = await seedAction(ctx.context, { step });

  await seedActionRiskClass(ctx.writer, seeded.action_id, 'always_ask');

  const row = await readTestAction(ctx.writer, seeded.action_id);

  expect(row.risk_class).toBe('always_ask');
});
