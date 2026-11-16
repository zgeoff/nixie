import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { writeStepCommit } from '../step/write-step-commit';
import { taskCreatedCodec } from '../task/codec/task-created-codec';
import { taskDefinitionSetCodec } from '../task/codec/task-definition-set-codec';
import { writeTaskLimitRaise } from '../task/limit/write-task-limit-raise';
import { claimTask } from '../task/projection/claim-task';
import { runTaskStep } from '../task/run-task-step';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { seedDefinitionTask } from '../test-utils/seed-definition-task';
import { seedTask } from '../test-utils/seed-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { writeTestTriggerFire } from '../test-utils/write-test-trigger-fire';
import type { StartedClaim } from '../types';
import { readRunRows } from './read-run-rows';
import { readRunSince } from './read-run-since';

async function setupTest() {
  const tasks = await startTestTasks();

  let fires = 0;

  onTestFinished(() => {
    setSystemTime();
  });

  const waitStep = (claim: StartedClaim) =>
    runTaskStep(tasks.context, claim, {
      runStep: (input) =>
        Promise.resolve({
          next: 'wait',
          records: [],
          acknowledged: input.inbox.map((record) => record.sequence),
        }),
      leaseMs: 60_000,
      logger: () => {},
      maxStepErrors: 3,
      retryDelayMs: 30_000,
      maxRetryDelayMs: 300_000,
    });

  const startRun = async (taskID: string) => {
    fires += 1;

    await writeTestTriggerFire(tasks.context, taskID, {
      definitionHash: 'hash-1',
      dedupeKey: `fire-${fires}`,
    });

    const claim = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

    invariant(claim, 'the fire is ready to claim');

    return claim;
  };

  return {
    ...tasks,

    // the records of the next write carry this time, in milliseconds since the epoch
    setNow: (timeMs: number) => {
      setSystemTime(new Date(timeMs));
    },
    readRuns: (taskID: string) => readRunRows(tasks.writer.db, taskID),
    writeDefinitionSet: (taskID: string, definitionHash: string | null) =>
      writeRecords(tasks.context.log, [
        {
          kind: 'task.definition_set',
          definitions: tasks.context.definitions(),
          thread: taskID,
          payload: taskDefinitionSetCodec.encode({
            taskID,
            definitionID: 'water-the-tomatoes',
            definitionHash,
          }),
        },
      ]),

    // a task of the definition that holds no hash yet, as a task of a withdrawn definition does
    writeUnenabledTask: async (taskID: string) => {
      await writeRecords(tasks.context.log, [
        {
          kind: 'task.created',
          definitions: tasks.context.definitions(),
          thread: taskID,
          payload: taskCreatedCodec.encode({ taskID, isConversation: false, state: 'waiting' }),
        },
        {
          kind: 'task.definition_set',
          definitions: tasks.context.definitions(),
          thread: taskID,
          payload: taskDefinitionSetCodec.encode({
            taskID,
            definitionID: 'water-the-tomatoes',
            definitionHash: null,
          }),
        },
      ]);
    },

    // a fire that the next claim turns into a task run, which waits idle for the next fire
    openRun: async (taskID: string) => {
      const claim = await startRun(taskID);

      await waitStep(claim);
    },
    startRun,
    enableDefinition: () =>
      seedDefinitionTask(tasks, {
        definitionID: 'water-the-tomatoes',
        definitionHash: 'hash-1',
        policy: { wakeable: true },
      }),

    // ends the task run at its limit, so a raise can carry it
    endAtLimit: (claim: StartedClaim, turns: number) =>
      writeStepCommit(tasks.context, claim, {
        next: 'continue',
        records: [],
        acknowledged: [],
        run: { activity: 'worked', limit: { meter: 'turns', used: turns, limit: turns } },
      }),

    // raises the limit and claims the task run that carries the ended one
    raiseRun: async (taskID: string, turns: number) => {
      const raised = await writeTaskLimitRaise(tasks.context, { taskID, limits: { turns } });
      const claim = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

      invariant(raised.status === 'raised' && claim, 'the raise opens a task run');

      return claim;
    },
    finishStep: (claim: StartedClaim) => waitStep(claim),
  };
}

test('it gives the start of the previous task run and the start of this one', async () => {
  const ctx = await setupTest();

  ctx.setNow(1_000_000);

  const taskID = await ctx.enableDefinition();

  ctx.setNow(1_060_000);

  await ctx.openRun(taskID);

  ctx.setNow(1_120_000);

  await ctx.openRun(taskID);

  const [, second] = await ctx.readRuns(taskID);

  invariant(second);

  const since = await readRunSince(ctx.context, second);

  expect(since).toStrictEqual({
    previousStartedAt: new Date(1_060_000),
    startedAt: new Date(1_120_000),
  });
});

test('it gives the time the definition was first enabled for its first task run, not a later set', async () => {
  const ctx = await setupTest();

  ctx.setNow(1_000_000);

  const taskID = await ctx.enableDefinition();

  ctx.setNow(1_030_000);

  await ctx.writeDefinitionSet(taskID, 'hash-2');

  ctx.setNow(1_060_000);

  await ctx.openRun(taskID);

  const [run] = await ctx.readRuns(taskID);

  invariant(run);

  const since = await readRunSince(ctx.context, run);

  expect(since).toStrictEqual({
    previousStartedAt: new Date(1_000_000),
    startedAt: new Date(1_060_000),
  });
});

test('it skips a null-hash definition set before the first one that holds a hash', async () => {
  const ctx = await setupTest();

  ctx.setNow(1_000_000);

  await ctx.writeUnenabledTask('tomato01');

  ctx.setNow(1_030_000);

  const taskID = await ctx.enableDefinition();

  ctx.setNow(1_060_000);

  await ctx.openRun(taskID);

  const [run] = await ctx.readRuns(taskID);

  invariant(run);

  const since = await readRunSince(ctx.context, run);

  expect(taskID).toBe('tomato01');

  expect(since).toStrictEqual({
    previousStartedAt: new Date(1_030_000),
    startedAt: new Date(1_060_000),
  });
});

test('it gives null for a first task run of a definition whose task never held a hash', async () => {
  const ctx = await setupTest();

  ctx.setNow(1_000_000);

  await ctx.writeUnenabledTask('tomato01');

  ctx.definitionStore.add('hash-1', {
    version: { definitionID: 'water-the-tomatoes' },
    policy: { wakeable: true },
  });

  ctx.setNow(1_060_000);

  await ctx.openRun('tomato01');

  const [run] = await ctx.readRuns('tomato01');

  invariant(run);

  const since = await readRunSince(ctx.context, run);

  expect(since).toBeNull();
});

test.each([[1], [2]])(
  'it gives the start of the first task run of a piece of work to a task run after %i raises',
  async (raises) => {
    const ctx = await setupTest();

    ctx.setNow(1_000_000);

    const taskID = await ctx.enableDefinition();

    ctx.setNow(1_030_000);

    let claim = await ctx.startRun(taskID);

    for (let raise = 0; raise < raises; raise += 1) {
      ctx.setNow(1_090_000 + raise * 60_000);

      await ctx.endAtLimit(claim, 40 + raise * 10);

      claim = await ctx.raiseRun(taskID, 50 + raise * 10);
    }

    await ctx.finishStep(claim);

    const runs = await ctx.readRuns(taskID);

    const carried = runs.at(-1);

    invariant(carried);

    expect(runs).toHaveLength(raises + 1);

    const since = await readRunSince(ctx.context, carried);

    expect(since).toStrictEqual({
      previousStartedAt: new Date(1_000_000),
      startedAt: new Date(1_030_000),
    });
  },
);

test('it gives the start of the first task run of a carried piece to the task run that follows it', async () => {
  const ctx = await setupTest();

  ctx.setNow(1_000_000);

  const taskID = await ctx.enableDefinition();

  ctx.setNow(1_060_000);

  const claim = await ctx.startRun(taskID);

  ctx.setNow(1_120_000);

  await ctx.endAtLimit(claim, 40);

  const carried = await ctx.raiseRun(taskID, 50);

  await ctx.finishStep(carried);

  ctx.setNow(1_180_000);

  await ctx.openRun(taskID);

  const runs = await ctx.readRuns(taskID);

  const next = runs.at(-1);

  invariant(next);

  expect(runs).toHaveLength(3);

  const since = await readRunSince(ctx.context, next);

  expect(since).toStrictEqual({
    previousStartedAt: new Date(1_060_000),
    startedAt: new Date(1_180_000),
  });
});

test("it gives null for a task run that is no definition's", async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: {},
  });

  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  const [run] = await ctx.readRuns(taskID);

  invariant(run);

  const since = await readRunSince(ctx.context, run);

  expect(since).toBeNull();
});
