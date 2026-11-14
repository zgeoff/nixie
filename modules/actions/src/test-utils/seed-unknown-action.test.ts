import { expect, test } from 'bun:test';
import { createTestStep } from './create-test-step';
import { readTestAction } from './read-test-action';
import { seedAction } from './seed-action';
import { seedUnknownAction } from './seed-unknown-action';
import { startTestActions } from './start-test-actions';

function setupTest() {
  return startTestActions();
}

test('it seeds a unknown action after one attempt', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const seeded = await seedUnknownAction(ctx.context, { step });
  const row = await readTestAction(ctx.writer, seeded.action_id);

  expect(row).toMatchObject({
    status: 'unknown',
    reason: 'ambiguous',
    attempt_count: 1,
    attempt_open: 0,
    tool: 'test.send',
    task_id: step.lease.workID,
  });
});

test('it applies an input override to the unknown action', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const seeded = await seedUnknownAction(ctx.context, { step, tool: 'test.archive' });
  const row = await readTestAction(ctx.writer, seeded.action_id);

  expect(row).toMatchObject({ status: 'unknown', tool: 'test.archive' });
});

test('it leaves a pending action seeded before it pending', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const pending = await seedAction(ctx.context, { step });

  await seedUnknownAction(ctx.context, { step, tool: 'test.archive' });

  const row = await readTestAction(ctx.writer, pending.action_id);

  expect(row).toMatchObject({ status: 'pending', attempt_count: 0 });
});
