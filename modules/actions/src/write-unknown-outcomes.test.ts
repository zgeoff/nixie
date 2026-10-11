import { expect, onTestFinished, test } from 'bun:test';
import { startWriter } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { claimTask, createTask, runRecovery, setFaultPointHandler } from '@heynixie/tasks';
import { createAllowedAction } from './create-allowed-action';
import { runStalledAttempt } from './test-utils/run-stalled-attempt';
import { startTestActions } from './test-utils/start-test-actions';
import type { ActionsTables } from './types';
import { writeUnknownOutcomes } from './write-unknown-outcomes';

// A process that died mid-step: its task's step was running, and the action it queued had an
// attempt record with no result, because the call outlived the lease. The restarted writer raised
// the epoch, as a real restart does.
async function setupTest() {
  const actions = await startTestActions();
  const taskID = await createTask(actions.context, 'send the weekly summary');
  const step = await claimTask(actions.context, { holder: 'old', leaseMs: 60_000 }).then(
    (claim) => claim ?? Promise.reject(new Error('the setup claim found no task')),
  );

  await createAllowedAction(actions.context, {
    taskID,
    stepKey: step.stepKey,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });
  await runStalledAttempt(actions);
  await actions.writer.stop();

  const writer = await startWriter({ dataDir: actions.dataDir });

  onTestFinished(() => writer.stop());

  const context: TasksContext = { ...actions.context, log: { ...actions.context.log, writer } };

  return { ...actions, context, db: writer.db.$extendTables<ActionsTables>(), taskID };
}

test('it marks an action whose attempt record has no result unknown, with a record', async () => {
  const ctx = await setupTest();

  await writeUnknownOutcomes(ctx.context);

  const action = await ctx.db.selectFrom('actions').selectAll().executeTakeFirstOrThrow();
  const records = await ctx.db
    .selectFrom('records')
    .select(['kind', 'thread'])
    .where('kind', '=', 'action.outcome')
    .execute();

  expect(action).toMatchObject({
    status: 'unknown',
    attempt_count: 1,
    attempt_open: 0,
    reason: 'attempt_without_result',
  });
  expect(records).toStrictEqual([{ kind: 'action.outcome', thread: ctx.taskID }]);
});

test('it runs as recovery step 3, between the interrupted steps and the late timers', async () => {
  const ctx = await setupTest();
  const reached: string[] = [];

  setFaultPointHandler((id) => {
    reached.push(id);
  });
  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  await runRecovery(ctx.context, {
    writeUnknownOutcomes: () => writeUnknownOutcomes(ctx.context),
    sandboxes: { removeStaleSandboxes: () => Promise.resolve() },
  });

  const task = await ctx.db.selectFrom('tasks').select('state').executeTakeFirstOrThrow();
  const leases = await ctx.db.selectFrom('leases').select('holder').execute();

  expect(reached).toStrictEqual([
    'recovery.step.1',
    'recovery.step.2',
    'inbox.write.after',
    'recovery.step.3',
    'recovery.step.4',
    'recovery.step.5',
  ]);
  expect(task.state).toBe('ready');
  expect(leases).toStrictEqual([{ holder: null }, { holder: null }]);
});

test('it leaves an action with no open attempt as it was', async () => {
  const ctx = await setupTest();

  await writeUnknownOutcomes(ctx.context);
  await writeUnknownOutcomes(ctx.context);

  const outcomes = await ctx.db
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', 'action.outcome')
    .execute();

  expect(outcomes).toHaveLength(1);
});
