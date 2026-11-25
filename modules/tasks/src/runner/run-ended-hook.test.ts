import { expect, mock, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildStepRunID } from '../step/build-step-run-id';
import { writeStepError } from '../step/write-step-error';
import { claimTask } from '../task/projection/claim-task';
import { writeTaskClose } from '../task/write-task-close';
import { writeTaskControl } from '../task/write-task-control';
import { buildTaskSeeder } from '../test-utils/build-task-seeder';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { startTestTasks } from '../test-utils/start-test-tasks';
import type { TasksContext } from '../types';
import { buildTaskRunnerRegistry } from './build-task-runner-registry';
import { conversationRunner } from './conversation-runner';
import { sandboxRunner } from './sandbox-runner';
import type { TaskRunnerDefinition } from './types';

type Ended = NonNullable<TaskRunnerDefinition['ended']>;

async function setupTest() {
  const tasks = await startTestTasks();
  const starter = await seedConversationStep(tasks.context);

  return {
    ...tasks,
    starter,
    seed: buildTaskSeeder(tasks),
    buildEndedContext: (ended: Ended): TasksContext => {
      const runner = { ...sandboxRunner, ended };

      return {
        ...tasks.context,
        runners: buildTaskRunnerRegistry({
          definitions: [conversationRunner, runner],
          defaultRunner: runner,
        }),
      };
    },
    claim: async (taskID: string) => {
      const claim = await claimTask(tasks.context, {
        holder: 'runner-a',
        leaseMs: 60_000,
        taskID,
      });

      invariant(claim, 'the started task is ready to claim');

      return claim;
    },
    readMarks: async (taskID: string) => {
      const entries = await readRecords(tasks.context.log, {
        afterSequence: 0,
        thread: taskID,
        kinds: ['task.mark_set'],
      });

      return entries.map((entry) => entry.record.payload);
    },
  };
}

test('#writeTaskControl calls the runner ended hook with stopped after a stop', async () => {
  const ctx = await setupTest();

  const ended = mock<Ended>(() => Promise.resolve());

  const taskID = await ctx.seed.task({
    starter: ctx.starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  await writeTaskControl(ctx.buildEndedContext(ended), { taskID, control: 'stop' });

  expect(ended.mock.calls).toStrictEqual([[expect.any(Object), taskID, 'stopped']]);
});

test('#writeTaskControl calls the runner ended hook with closed after a close', async () => {
  const ctx = await setupTest();

  const ended = mock<Ended>(() => Promise.resolve());

  const taskID = await ctx.seed.task({
    starter: ctx.starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  await writeTaskControl(ctx.buildEndedContext(ended), { taskID, control: 'close' });

  expect(ended.mock.calls).toStrictEqual([[expect.any(Object), taskID, 'closed']]);
});

test('#writeTaskControl calls no ended hook after a pause', async () => {
  const ctx = await setupTest();

  const ended = mock<Ended>(() => Promise.resolve());

  const taskID = await ctx.seed.task({
    starter: ctx.starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  await writeTaskControl(ctx.buildEndedContext(ended), { taskID, control: 'pause' });

  expect(ended.mock.calls).toStrictEqual([]);
});

test('#writeTaskControl calls no ended hook after the restart of a stopped task', async () => {
  const ctx = await setupTest();

  const ended = mock<Ended>(() => Promise.resolve());

  const taskID = await ctx.seed.stoppedTask({
    starter: ctx.starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  await writeTaskControl(ctx.buildEndedContext(ended), { taskID, control: 'restart' });

  expect(ended.mock.calls).toStrictEqual([]);
});

test('#writeTaskControl calls no ended hook for a refused close of a closed task', async () => {
  const ctx = await setupTest();

  const ended = mock<Ended>(() => Promise.resolve());

  const taskID = await ctx.seed.closedTask({
    starter: ctx.starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  await writeTaskControl(ctx.buildEndedContext(ended), { taskID, control: 'close' });

  expect(ended.mock.calls).toStrictEqual([]);
});

test('#writeTaskControl returns the stop as controlled when the ended hook throws', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.seed.task({
    starter: ctx.starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const context = ctx.buildEndedContext(() => Promise.reject(new Error('the session is gone')));

  const outcome = await writeTaskControl(context, { taskID, control: 'stop' });

  expect(outcome).toStrictEqual({
    status: 'controlled',
    state: 'stopped',
    isPauseRequested: false,
    sequence: expect.toBeNumber(),
  });
});

test('#writeTaskClose calls the runner ended hook with closed after the close of a waiting task', async () => {
  const ctx = await setupTest();

  const ended = mock<Ended>(() => Promise.resolve());

  const taskID = await ctx.seed.waitingTask({
    starter: ctx.starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  await writeTaskClose(ctx.buildEndedContext(ended), {
    from: 'conversation',
    taskID,
    stepRunID: buildStepRunID(ctx.starter.claim),
  });

  expect(ended.mock.calls).toStrictEqual([[expect.any(Object), taskID, 'closed']]);
});

test('#writeTaskClose calls no ended hook for a second close of a closed task', async () => {
  const ctx = await setupTest();

  const ended = mock<Ended>(() => Promise.resolve());

  const taskID = await ctx.seed.closedTask({
    starter: ctx.starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  await writeTaskClose(ctx.buildEndedContext(ended), {
    from: 'conversation',
    taskID,
    stepRunID: buildStepRunID(ctx.starter.claim),
  });

  expect(ended.mock.calls).toStrictEqual([]);
});

test('#writeTaskClose returns the close as closed when the ended hook throws', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.seed.waitingTask({
    starter: ctx.starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const context = ctx.buildEndedContext(() => Promise.reject(new Error('the session is gone')));

  const outcome = await writeTaskClose(context, {
    from: 'conversation',
    taskID,
    stepRunID: buildStepRunID(ctx.starter.claim),
  });

  expect(outcome).toStrictEqual({ status: 'closed', wasClosed: false });
});

test('#writeStepError calls the runner ended hook with failed when the error fails the task', async () => {
  const ctx = await setupTest();

  const ended = mock<Ended>(() => Promise.resolve());

  const taskID = await ctx.seed.task({
    starter: ctx.starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const claim = await ctx.claim(taskID);

  await writeStepError(ctx.buildEndedContext(ended), claim, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 1,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  expect(ended.mock.calls).toStrictEqual([[expect.any(Object), taskID, 'failed']]);
});

test('#writeStepError calls no ended hook when the task retries the step', async () => {
  const ctx = await setupTest();

  const ended = mock<Ended>(() => Promise.resolve());

  const taskID = await ctx.seed.task({
    starter: ctx.starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const claim = await ctx.claim(taskID);

  await writeStepError(ctx.buildEndedContext(ended), claim, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  expect(ended.mock.calls).toStrictEqual([]);
});

test('#writeTaskControl writes the records that the ended hook commits on the task thread', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.seed.task({
    starter: ctx.starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const context = ctx.buildEndedContext((end, endedTaskID) =>
    end.commit({
      records: [
        {
          kind: 'task.mark_set',
          definitions: end.definitions(),
          payload: { taskID: endedTaskID, disposable: true },
        },
      ],
      actions: [],
    }),
  );

  await writeTaskControl(context, { taskID, control: 'stop' });

  const marks = await ctx.readMarks(taskID);

  expect(marks).toStrictEqual([{ taskID, disposable: true }]);
});
