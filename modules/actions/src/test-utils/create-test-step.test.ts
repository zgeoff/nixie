import { expect, test } from 'bun:test';
import { createTestStep } from './create-test-step';
import { startTestActions } from './start-test-actions';

test('it claims the first step of a new task under a 60 s lease', async () => {
  const ctx = await startTestActions();

  const step = await createTestStep(ctx.context);

  expect(step).toStrictEqual({
    lease: {
      kind: 'task',
      workID: expect.toBeString(),
      holder: 'step-runner',
      generation: 1,
      epoch: ctx.writer.epoch,
      expiresAt: 1_060_000,
    },
    stepKey: `${step.lease.workID}:1`,
  });
});
