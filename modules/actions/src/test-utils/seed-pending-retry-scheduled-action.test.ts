import { expect, test } from 'bun:test';
import { createTestStep } from './create-test-step';
import { readTestAction } from './read-test-action';
import { seedAction } from './seed-action';
import { seedPendingRetryScheduledAction } from './seed-pending-retry-scheduled-action';
import { startTestActions } from './start-test-actions';

function setupTest() {
  return startTestActions();
}

test('it seeds a pending action with one started attempt and a retry scheduled', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const seeded = await seedPendingRetryScheduledAction(ctx.context, { step });
  const row = await readTestAction(ctx.writer, seeded.action_id);

  expect(row).toMatchObject({
    status: 'pending',
    attempt_count: 1,
    attempt_open: 0,
    tool: 'test.send',
    task_id: step.lease.workID,
  });

  expect(row.next_attempt_at).toBeGreaterThan(ctx.clock.now());
});

test('it applies an input override to the pending action', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const seeded = await seedPendingRetryScheduledAction(ctx.context, { step, tool: 'test.archive' });
  const row = await readTestAction(ctx.writer, seeded.action_id);

  expect(row).toMatchObject({ status: 'pending', tool: 'test.archive' });
});

test('it leaves a pending action seeded before it with no attempt', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const pending = await seedAction(ctx.context, { step });

  await seedPendingRetryScheduledAction(ctx.context, { step, tool: 'test.archive' });

  const row = await readTestAction(ctx.writer, pending.action_id);

  expect(row).toMatchObject({ status: 'pending', attempt_count: 0 });
});
