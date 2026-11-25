import { expect, test } from 'bun:test';
import type { RecordKind } from '@heynixie/log';
import { readRecords, withWriteTransaction, writeRecords } from '@heynixie/log';
import type { RunnerAction, TaskRunnerDefinition, TasksContext } from '@heynixie/tasks';
import {
  buildTaskRunnerRegistry,
  conversationRunner,
  sandboxRunner,
  writeStepCommit,
  writeTaskControl,
} from '@heynixie/tasks';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import { buildActionSeeder } from '../test-utils/build-action-seeder';
import { createTestStep } from '../test-utils/create-test-step';
import { readTestAction } from '../test-utils/read-test-action';
import { readTestActions } from '../test-utils/read-test-actions';
import { startTestActions } from '../test-utils/start-test-actions';
import { buildRunnerActionHash, makeQueueRunnerActions } from './make-queue-runner-actions';

type Ended = NonNullable<TaskRunnerDefinition['ended']>;

async function setupTest() {
  const actions = await startTestActions();

  const queue = makeQueueRunnerActions(actions.context);

  return {
    ...actions,
    seed: buildActionSeeder({ context: actions.context }),
    taskSeed: buildTaskSeeder({ context: actions.context }),
    queue: (taskID: string, stepKey: string, runnerActions: readonly RunnerAction[]) =>
      withWriteTransaction(actions.writer, (tx) =>
        queue(tx, { taskID, stepKey, actions: runnerActions }),
      ),
    buildEndedContext: (ended: Ended): TasksContext => {
      const runner = { ...sandboxRunner, ended };

      return {
        ...actions.context,
        runners: buildTaskRunnerRegistry({
          definitions: [conversationRunner, runner],
          defaultRunner: runner,
        }),
      };
    },
    readQueued: async () => {
      const entries = await readRecords(actions.context.log, {
        afterSequence: 0,
        kinds: ['action.queued' satisfies RecordKind],
      });

      return entries.map((entry) => ({
        thread: entry.record.thread,
        payload: entry.record.payload,
        erasable: entry.record.erasable,
      }));
    },
  };
}

test('it writes one action.queued per runner action on the task thread, with the arguments erasable', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const taskID = step.lease.workID;

  const actionIDs = await ctx.queue(taskID, 'step-1', [
    {
      tool: 'coding.start',
      args: { repo: 'garden-planner' },
      hashParts: ['garden-planner'],
      causedBy: { kind: 'record', sequence: 7 },
    },
    {
      tool: 'coding.send',
      args: { text: 'Add a frost warning.' },
      hashParts: ['frost'],
      causedBy: { kind: 'record', sequence: 8 },
    },
  ]);

  const queued = await ctx.readQueued();

  const [startID, sendID] = actionIDs;

  invariant(startID !== undefined && sendID !== undefined, 'the queue returned both action IDs');

  expect(queued).toStrictEqual([
    {
      thread: taskID,
      payload: {
        actionID: startID,
        taskID,
        stepKey: 'step-1',
        tool: 'coding.start',
        actionHash: buildRunnerActionHash({ tool: 'coding.start', hashParts: ['garden-planner'] }),
        nextAttemptAt: 1_000_000,
        isRunner: true,
        callSequence: 7,
      },
      erasable: { status: 'readable', fields: { arguments: { repo: 'garden-planner' } } },
    },
    {
      thread: taskID,
      payload: {
        actionID: sendID,
        taskID,
        stepKey: 'step-1',
        tool: 'coding.send',
        actionHash: buildRunnerActionHash({ tool: 'coding.send', hashParts: ['frost'] }),
        nextAttemptAt: 1_000_000,
        isRunner: true,
        callSequence: 8,
      },
      erasable: { status: 'readable', fields: { arguments: { text: 'Add a frost warning.' } } },
    },
  ]);
});

test('it marks a queued runner action as a runner action in the actions table', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const [actionID] = await ctx.queue(step.lease.workID, 'step-1', [
    {
      tool: 'coding.start',
      args: { repo: 'garden-planner' },
      hashParts: ['garden-planner'],
      causedBy: { kind: 'record', sequence: 7 },
    },
  ]);

  invariant(actionID !== undefined, 'the queue returned the action ID');

  const action = await readTestAction(ctx.writer, actionID);

  expect(action.is_runner).toBe(1);
});

test('it takes the call sequence of a runner action caused by a tool call from its tool_called record', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const taskID = step.lease.workID;

  const [call] = await writeRecords(ctx.context.log, [
    {
      kind: 'tool_called',
      definitions: ctx.context.definitions(),
      thread: taskID,
      payload: { callID: 'call-9', runID: taskID, toolUseID: null, tool: 'coding.start' },
      erasable: { input: { repo: 'garden-planner' } },
    },
  ]);

  await ctx.queue(taskID, 'step-1', [
    {
      tool: 'coding.start',
      args: { repo: 'garden-planner' },
      hashParts: ['garden-planner'],
      causedBy: { kind: 'tool_call', callID: 'call-9' },
    },
  ]);

  const [queued] = await ctx.readQueued();

  expect(queued?.payload['callSequence']).toBe(call?.sequence);
});

test('it queues a runner action with no call sequence when no tool_called record holds its call ID', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await ctx.queue(step.lease.workID, 'step-1', [
    {
      tool: 'coding.start',
      args: { repo: 'garden-planner' },
      hashParts: ['garden-planner'],
      causedBy: { kind: 'tool_call', callID: 'call-9' },
    },
  ]);

  const [queued] = await ctx.readQueued();

  expect(queued?.payload).not.toContainKey('callSequence');
});

test('it returns the first action ID and writes nothing for the same action queued again by the same step', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const taskID = step.lease.workID;

  const action: RunnerAction = {
    tool: 'coding.start',
    args: { repo: 'garden-planner' },
    hashParts: ['garden-planner'],
    causedBy: { kind: 'record', sequence: 7 },
  };

  const first = await ctx.queue(taskID, 'step-1', [action]);
  const second = await ctx.queue(taskID, 'step-1', [action]);
  const queued = await ctx.readQueued();

  expect(second).toStrictEqual(first);
  expect(queued).toHaveLength(1);
});

test('it returns the first action ID and writes nothing for the same action from another step while the first is pending', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const taskID = step.lease.workID;

  const action: RunnerAction = {
    tool: 'coding.start',
    args: { repo: 'garden-planner' },
    hashParts: ['garden-planner'],
    causedBy: { kind: 'record', sequence: 7 },
  };

  const first = await ctx.queue(taskID, 'step-1', [action]);
  const second = await ctx.queue(taskID, 'step-2', [action]);
  const queued = await ctx.readQueued();

  expect(second).toStrictEqual(first);
  expect(queued).toHaveLength(1);
});

test('it returns the ID of an unknown action with the same hash for the same action from another step', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const unknown = await ctx.seed.unknownAction({
    step,
    tool: 'coding.start',
    actionHash: buildRunnerActionHash({ tool: 'coding.start', hashParts: ['garden-planner'] }),
  });

  const actionIDs = await ctx.queue(step.lease.workID, 'step-2', [
    {
      tool: 'coding.start',
      args: { repo: 'garden-planner' },
      hashParts: ['garden-planner'],
      causedBy: { kind: 'record', sequence: 7 },
    },
  ]);

  expect(actionIDs).toStrictEqual([unknown.action_id]);
});

test('it queues a new action for the same action from another step once the first is done', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const done = await ctx.seed.doneAction({
    step,
    tool: 'coding.start',
    actionHash: buildRunnerActionHash({ tool: 'coding.start', hashParts: ['garden-planner'] }),
  });

  const [actionID] = await ctx.queue(step.lease.workID, 'step-2', [
    {
      tool: 'coding.start',
      args: { repo: 'garden-planner' },
      hashParts: ['garden-planner'],
      causedBy: { kind: 'record', sequence: 7 },
    },
  ]);

  const rows = await readTestActions(ctx.writer);

  invariant(actionID !== undefined, 'the queue returned the action ID');

  expect(rows.map((row) => ({ actionID: row.actionID, status: row.status }))).toStrictEqual([
    { actionID: done.action_id, status: 'done' },
    { actionID, status: 'pending' },
  ]);
});

test('it returns the ID of a done action for the same action queued again by the step that queued it', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const done = await ctx.seed.doneAction({
    step,
    tool: 'coding.start',
    actionHash: buildRunnerActionHash({ tool: 'coding.start', hashParts: ['garden-planner'] }),
  });

  const actionIDs = await ctx.queue(step.lease.workID, step.stepKey, [
    {
      tool: 'coding.start',
      args: { repo: 'garden-planner' },
      hashParts: ['garden-planner'],
      causedBy: { kind: 'record', sequence: 7 },
    },
  ]);

  expect(actionIDs).toStrictEqual([done.action_id]);
});

test('#writeStepCommit queues the actions of a step result on the task thread under the step key', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const taskID = step.lease.workID;

  await writeStepCommit(ctx.context, step, {
    next: 'wait',
    records: [],
    acknowledged: [],
    actions: [
      {
        tool: 'coding.start',
        args: { repo: 'garden-planner' },
        hashParts: ['garden-planner'],
        causedBy: { kind: 'record', sequence: 7 },
      },
    ],
  });

  const queued = await ctx.readQueued();

  expect(queued).toStrictEqual([
    {
      thread: taskID,
      payload: {
        actionID: expect.toBeString(),
        taskID,
        stepKey: step.stepKey,
        tool: 'coding.start',
        actionHash: buildRunnerActionHash({ tool: 'coding.start', hashParts: ['garden-planner'] }),
        nextAttemptAt: 1_000_000,
        isRunner: true,
        callSequence: 7,
      },
      erasable: { status: 'readable', fields: { arguments: { repo: 'garden-planner' } } },
    },
  ]);
});

test('#writeStepCommit queues no action once its lease expired', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  ctx.clock.advance(60_000);

  const commit = writeStepCommit(ctx.context, step, {
    next: 'wait',
    records: [],
    acknowledged: [],
    actions: [
      {
        tool: 'coding.start',
        args: { repo: 'garden-planner' },
        hashParts: ['garden-planner'],
        causedBy: { kind: 'record', sequence: 7 },
      },
    ],
  });

  await commit.catch(() => {});

  const queued = await ctx.readQueued();

  expect(commit).rejects.toMatchObject({ name: 'LeaseLostError' });
  expect(queued).toStrictEqual([]);
});

test('#writeTaskControl queues the actions that the ended hook of a stopped task commits, on its thread', async () => {
  const ctx = await setupTest();
  const starter = await ctx.taskSeed.conversationStep();

  const taskID = await ctx.taskSeed.task({
    starter: starter.claim,
    name: 'Garden planner',
    brief: 'Add a frost warning to the planner.',
  });

  const context = ctx.buildEndedContext((end) =>
    end.commit({
      records: [],
      actions: [
        {
          tool: 'coding.stop',
          args: { session: 's-1' },
          hashParts: ['s-1'],
          causedBy: { kind: 'record', sequence: 3 },
        },
      ],
    }),
  );

  await writeTaskControl(context, { taskID, control: 'stop' });

  const queued = await ctx.readQueued();

  expect(queued).toStrictEqual([
    {
      thread: taskID,
      payload: {
        actionID: expect.toBeString(),
        taskID,
        stepKey: `ended:stopped:${taskID}`,
        tool: 'coding.stop',
        actionHash: buildRunnerActionHash({ tool: 'coding.stop', hashParts: ['s-1'] }),
        nextAttemptAt: 1_000_000,
        isRunner: true,
        callSequence: 3,
      },
      erasable: { status: 'readable', fields: { arguments: { session: 's-1' } } },
    },
  ]);
});
