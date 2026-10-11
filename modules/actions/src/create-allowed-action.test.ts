import { expect, onTestFinished, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import type { FaultPointID } from '@heynixie/tasks';
import { LeaseLostError, setFaultPointHandler } from '@heynixie/tasks';
import { createAllowedAction } from './create-allowed-action';
import { createTestStep } from './test-utils/create-test-step';
import { startTestActions } from './test-utils/start-test-actions';
import type { ActionsTables, AllowedCall } from './types';

async function setupTest() {
  const actions = await startTestActions();
  const db = actions.writer.db.$extendTables<ActionsTables>();
  const step = await createTestStep(actions.context);
  const taskID = step.lease.workID;
  const call: AllowedCall = {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team', body: 'the weekly summary' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  };

  return { ...actions, db, taskID, call };
}

test('it queues an allowed call as a pending action due at once', async () => {
  const ctx = await setupTest();

  const queued = await createAllowedAction(ctx.context, ctx.call);

  const action = await ctx.db.selectFrom('actions').selectAll().executeTakeFirstOrThrow();

  expect(queued).toStrictEqual({ actionID: action.action_id, status: 'pending', isRepeat: false });
  expect(action).toMatchObject({
    task_id: ctx.taskID,
    step_key: `${ctx.taskID}:1`,
    action_hash: 'sha256:send-1',
    tool: 'test.send',
    status: 'pending',
    attempt_count: 0,
    attempt_open: 0,
    next_attempt_at: 1_000_000,
  });
});

test('it records the decision and keeps the arguments in the erasable fields', async () => {
  const ctx = await setupTest();

  await createAllowedAction(ctx.context, ctx.call);

  const entries = await readRecords(ctx.context.log, { afterSequence: 2 });

  expect(entries.map((entry) => entry.record)).toMatchObject([
    {
      kind: 'action.queued',
      thread: ctx.taskID,
      decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
      erasable: { status: 'readable', fields: { arguments: ctx.call.arguments } },
    },
  ]);
});

test('it refuses a call the decision point did not allow', async () => {
  const ctx = await setupTest();

  const create = createAllowedAction(ctx.context, {
    ...ctx.call,
    decision: { outcome: 'ask', stage: 9, rule: null },
  });

  await create.catch(() => {});

  expect(create).rejects.toThrowWithMessage(
    Error,
    'a call the decision point answered ask queues nothing',
  );
});

test('it returns the earlier action for a repeat call under the same step key', async () => {
  const ctx = await setupTest();
  const first = await createAllowedAction(ctx.context, ctx.call);

  await ctx.db.updateTable('actions').set({ status: 'done' }).execute();

  const repeat = await createAllowedAction(ctx.context, ctx.call);

  expect(repeat).toStrictEqual({ actionID: first.actionID, status: 'done', isRepeat: true });
});

test('it returns the earlier action for a repeat call while that action is pending', async () => {
  const ctx = await setupTest();
  const first = await createAllowedAction(ctx.context, ctx.call);

  const repeat = await createAllowedAction(ctx.context, {
    ...ctx.call,
    step: { ...ctx.call.step, stepKey: `${ctx.taskID}:2` },
  });

  expect(repeat).toStrictEqual({ actionID: first.actionID, status: 'pending', isRepeat: true });
});

test('it returns the earlier action for a repeat call while that action is unknown', async () => {
  const ctx = await setupTest();
  const first = await createAllowedAction(ctx.context, ctx.call);

  await ctx.db.updateTable('actions').set({ status: 'unknown' }).execute();

  const repeat = await createAllowedAction(ctx.context, {
    ...ctx.call,
    step: { ...ctx.call.step, stepKey: `${ctx.taskID}:2` },
  });

  expect(repeat).toStrictEqual({ actionID: first.actionID, status: 'unknown', isRepeat: true });
});

test('it queues a new action when the same call settled under an earlier step', async () => {
  const ctx = await setupTest();
  const first = await createAllowedAction(ctx.context, ctx.call);

  await ctx.db.updateTable('actions').set({ status: 'done' }).execute();

  const next = await createAllowedAction(ctx.context, {
    ...ctx.call,
    step: { ...ctx.call.step, stepKey: `${ctx.taskID}:2` },
  });

  expect(next.isRepeat).toBeFalse();
  expect(next.actionID).not.toBe(first.actionID);
});

test('it queues nothing once the step lost its lease', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(60_000);

  const create = createAllowedAction(ctx.context, ctx.call);

  await create.catch(() => {});

  const actions = await ctx.db.selectFrom('actions').select('action_id').execute();

  expect(create).rejects.toThrow(LeaseLostError);
  expect(actions).toStrictEqual([]);
});

test('it reaches queue.commit.before and queue.commit.after around the queue', async () => {
  const ctx = await setupTest();
  const reached: FaultPointID[] = [];

  setFaultPointHandler((id) => {
    reached.push(id);
  });
  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  await createAllowedAction(ctx.context, ctx.call);

  expect(reached).toStrictEqual(['queue.commit.before', 'queue.commit.after']);
});
