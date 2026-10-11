import { expect, test } from 'bun:test';
import { createAllowedAction } from '../create-allowed-action';
import type { ActionsTables } from '../types';
import { createTestStep } from './create-test-step';
import { runStalledAttempt } from './run-stalled-attempt';
import { startTestActions } from './start-test-actions';

test('it leaves an attempt record with no result after one provider call', async () => {
  const ctx = await startTestActions();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const calls = await runStalledAttempt(ctx);

  const action = await ctx.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select(['status', 'attempt_count', 'attempt_open'])
    .executeTakeFirstOrThrow();

  expect(calls).toBe(1);
  expect(action).toStrictEqual({ status: 'pending', attempt_count: 1, attempt_open: 1 });
});

test('it refuses to run when no action is due', async () => {
  const ctx = await startTestActions();

  const run = runStalledAttempt(ctx);

  await run.catch(() => {});

  expect(run).rejects.toThrowWithMessage(Error, 'no action was due for a stalled attempt');
});
