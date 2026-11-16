import { expect, test } from 'bun:test';
import { createTestStep } from './create-test-step';
import { seedInStepAction } from './seed-in-step-action';
import { startTestActions } from './start-test-actions';

test('it seeds a pending approved action that the step runs', async () => {
  const ctx = await startTestActions();
  const step = await createTestStep(ctx.context);
  const action = await seedInStepAction(ctx.context, { step });

  expect(action).toMatchObject({
    status: 'pending',
    is_approved: 1,
    runs_in_step: 1,
    attempt_count: 0,
    task_id: step.lease.workID,
  });
});
