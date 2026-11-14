import { expect, test } from 'bun:test';
import { createTestStep } from './create-test-step';
import { readTestAction } from './read-test-action';
import { seedAction } from './seed-action';
import { startTestActions } from './start-test-actions';

function setupTest() {
  return startTestActions();
}

test('it seeds a pending action that no attempt has touched', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const seeded = await seedAction(ctx.context, { step });
  const row = await readTestAction(ctx.writer, seeded.action_id);

  expect(row).toMatchObject({
    status: 'pending',
    reason: null,
    attempt_count: 0,
    attempt_open: 0,
    tool: 'test.send',
    task_id: step.lease.workID,
  });
});

test('it applies an input override to the seeded action', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const seeded = await seedAction(ctx.context, { step, tool: 'test.archive' });
  const row = await readTestAction(ctx.writer, seeded.action_id);

  expect(row.tool).toBe('test.archive');
});

test('it seeds two actions on one step', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const first = await seedAction(ctx.context, { step });
  const second = await seedAction(ctx.context, { step });

  expect(second.action_id).not.toBe(first.action_id);
});
