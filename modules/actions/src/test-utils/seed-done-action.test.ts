import { expect, test } from 'bun:test';
import { createTestStep } from './create-test-step';
import { readTestAction } from './read-test-action';
import { seedAction } from './seed-action';
import { seedDoneAction } from './seed-done-action';
import { startTestActions } from './start-test-actions';

function setupTest() {
  return startTestActions();
}

test('it seeds a done action after one attempt', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const seeded = await seedDoneAction(ctx.context, { step });
  const row = await readTestAction(ctx.writer, seeded.action_id);

  expect(row).toMatchObject({
    status: 'done',
    reason: null,
    attempt_count: 1,
    attempt_open: 0,
    tool: 'test.send',
    task_id: step.lease.workID,
  });
});

test('it applies an input override to the done action', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const seeded = await seedDoneAction(ctx.context, { step, tool: 'test.archive' });
  const row = await readTestAction(ctx.writer, seeded.action_id);

  expect(row).toMatchObject({ status: 'done', tool: 'test.archive' });
});

test('it leaves a pending action seeded before it pending', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const pending = await seedAction(ctx.context, { step });

  await seedDoneAction(ctx.context, { step, tool: 'test.archive' });

  const row = await readTestAction(ctx.writer, pending.action_id);

  expect(row).toMatchObject({ status: 'pending', attempt_count: 0 });
});
