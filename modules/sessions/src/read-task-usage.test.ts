import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { modelSessionSummarizedCodec, modelTurnEndedCodec } from '@heynixie/models';
import {
  claimTask,
  taskLimitReachedCodec,
  taskLimitsRaisedCodec,
  taskStepCommittedCodec,
  taskStepErroredCodec,
  taskStepInterruptedCodec,
  writeFailedTurnSpend,
  writeStepError,
  writeTaskLimitPause,
} from '@heynixie/tasks';
import { seedConversationStep, seedStartedTask } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import { readTaskUsage } from './read-task-usage';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    tasks,
    claimStartedTask: async (taskID: string) => {
      const claim = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

      invariant(claim, 'the started task is ready to claim');

      return claim;
    },
  };
}

test("it counts a task's turns, and prices both its turns and the summaries of its session", async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: modelTurnEndedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'tide-tables',
      payload: modelTurnEndedCodec.encode({
        model: 'claude-test',
        profile: 'task-direct',
        stopReason: 'end_turn',
        turns: 1,
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        pinnedCore: [],
        retrieved: [],
        invalidatedThrough: 0,
        sessionImageBytes: 0,
        sessionImageCount: 0,
      }),
    },
    {
      kind: modelSessionSummarizedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'tide-tables',
      payload: modelSessionSummarizedCodec.encode({
        model: 'claude-test',
        profile: 'task-direct',
        throughSequence: 1,
        boundary: { sessionID: 'session-a', messageID: 'message-a' },
        trigger: 'threshold',
        summaryTokens: 900,
        isCut: false,
        usage: { inputTokens: 0, outputTokens: 100_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
      }),
    },
  ]);

  const used = await readTaskUsage(ctx.tasks.context, 'tide-tables', {
    input: 3,
    cacheWrite: 3.75,
    cacheWrite1h: 6,
    cachedInput: 0.3,
    output: 15,
  });

  expect(used).toStrictEqual({ turns: 1, dollars: 4.5 });
});

test("it prices a turn's cache reads at the cached rate and its cache writes at the longer lifetime's rate", async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: modelTurnEndedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'tide-tables',
      payload: modelTurnEndedCodec.encode({
        model: 'claude-test',
        profile: 'task-direct',
        stopReason: 'end_turn',
        turns: 1,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 1_000_000,
        cacheWriteTokens: 1_000_000,
        pinnedCore: [],
        retrieved: [],
        invalidatedThrough: 0,
        sessionImageBytes: 0,
        sessionImageCount: 0,
      }),
    },
  ]);

  const used = await readTaskUsage(ctx.tasks.context, 'tide-tables', {
    input: 3,
    cacheWrite: 3.75,
    cacheWrite1h: 6,
    cachedInput: 0.3,
    output: 15,
  });

  expect(used).toStrictEqual({ turns: 1, dollars: 6.3 });
});

test('it counts and prices a turn recorded before turns kept their image count', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: modelTurnEndedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'tide-tables',
      payload: {
        model: 'claude-test',
        profile: 'task-direct',
        stopReason: 'end_turn',
        turns: 1,
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        pinnedCore: [],
        retrieved: [],
        invalidatedThrough: 0,
      },
    },
  ]);

  const used = await readTaskUsage(ctx.tasks.context, 'tide-tables', {
    input: 3,
    cacheWrite: 3.75,
    cacheWrite1h: 6,
    cachedInput: 0.3,
    output: 15,
  });

  expect(used).toStrictEqual({ turns: 1, dollars: 3 });
});

test('it counts no dollars for a summary recorded with no usage', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: modelSessionSummarizedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'tide-tables',
      payload: modelSessionSummarizedCodec.encode({
        model: 'claude-test',
        profile: 'task-direct',
        throughSequence: 0,
        boundary: { sessionID: 'session-a', messageID: 'message-a' },
        trigger: 'threshold',
        summaryTokens: 900,
        isCut: false,
      }),
    },
  ]);

  const used = await readTaskUsage(ctx.tasks.context, 'tide-tables', {
    input: 3,
    cacheWrite: 3.75,
    cacheWrite1h: 6,
    cachedInput: 0.3,
    output: 15,
  });

  expect(used).toStrictEqual({ turns: 0, dollars: 0 });
});

test('it counts the dollars that a pause recorded for a turn that left no turn record', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: taskLimitReachedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'tide-tables',
      payload: taskLimitReachedCodec.encode({
        taskID: 'tide-tables',
        stepKey: 'tide-tables:1',
        used: { turns: 0, dollars: 0.03 },
        limits: { turns: 25, dollars: 0.03 },
      }),
    },
  ]);

  const used = await readTaskUsage(ctx.tasks.context, 'tide-tables', {
    input: 3,
    cacheWrite: 3.75,
    cacheWrite1h: 6,
    cachedInput: 0.3,
    output: 15,
  });

  expect(used).toStrictEqual({ turns: 0, dollars: 0.03 });
});

test('it counts the dollars of a failed turn, and no turn', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.tasks.context);

  const taskID = await seedStartedTask(ctx.tasks.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const claim = await ctx.claimStartedTask(taskID);

  await writeFailedTurnSpend(ctx.tasks.context, { taskID, dollars: 0.03 });

  await writeStepError(ctx.tasks.context, claim, {
    error: new Error('the guest lost its model stream'),
    maxStepErrors: 3,
    retryDelayMs: 0,
    maxRetryDelayMs: 0,
  });

  const used = await readTaskUsage(ctx.tasks.context, taskID, {
    input: 3,
    cacheWrite: 3.75,
    cacheWrite1h: 6,
    cachedInput: 0.3,
    output: 15,
  });

  expect(used).toStrictEqual({ turns: 0, dollars: 0.03 });
});

test('it counts the dollars of a failed turn that reached the limit once, past its pause', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.tasks.context);

  const taskID = await seedStartedTask(ctx.tasks.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const claim = await ctx.claimStartedTask(taskID);

  await writeFailedTurnSpend(ctx.tasks.context, { taskID, dollars: 0.03 });

  await writeTaskLimitPause(ctx.tasks.context, {
    lease: claim.lease,
    stepKey: claim.stepKey,
    startedBy: starter.claim.lease.workID,
    used: { turns: 0, dollars: 0.03 },
    limits: { turns: 25, dollars: 0.03 },
  });

  await writeStepError(ctx.tasks.context, claim, {
    error: new Error('the guest lost its model stream'),
    maxStepErrors: 3,
    retryDelayMs: 0,
    maxRetryDelayMs: 0,
  });

  const used = await readTaskUsage(ctx.tasks.context, taskID, {
    input: 3,
    cacheWrite: 3.75,
    cacheWrite1h: 6,
    cachedInput: 0.3,
    output: 15,
  });

  expect(used).toStrictEqual({ turns: 0, dollars: 0.03 });
});

test('it counts a turn whose pause came before its turn record once', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: taskLimitReachedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'tide-tables',
      payload: taskLimitReachedCodec.encode({
        taskID: 'tide-tables',
        stepKey: 'tide-tables:1',
        used: { turns: 1, dollars: 3.5 },
        limits: { turns: 25, dollars: 2 },
      }),
    },
    {
      kind: modelTurnEndedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'tide-tables',
      payload: modelTurnEndedCodec.encode({
        model: 'claude-test',
        profile: 'task-direct',
        stopReason: 'end_turn',
        turns: 1,
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        pinnedCore: [],
        retrieved: [],
        invalidatedThrough: 0,
        sessionImageBytes: 0,
        sessionImageCount: 0,
      }),
    },
    {
      kind: taskStepCommittedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'tide-tables',
      stepKey: 'tide-tables:1',
      payload: taskStepCommittedCodec.encode({
        taskID: 'tide-tables',
        nextState: 'ready',
        readCursor: 0,
        sessionBoundary: null,
        timers: [],
      }),
    },
  ]);

  const used = await readTaskUsage(ctx.tasks.context, 'tide-tables', {
    input: 3,
    cacheWrite: 3.75,
    cacheWrite1h: 6,
    cachedInput: 0.3,
    output: 15,
  });

  expect(used).toStrictEqual({ turns: 1, dollars: 3 });
});

test.each([
  [
    'a raise, so the turn record is its own',
    {
      kind: taskLimitsRaisedCodec.kind,
      payload: taskLimitsRaisedCodec.encode({
        taskID: 'tide-tables',
        limits: { turns: 25, dollars: 10 },
      }),
    },
    3,
  ],
  [
    "the step's error, so the turn record is its retry's",
    {
      kind: taskStepErroredCodec.kind,
      payload: taskStepErroredCodec.encode({
        taskID: 'tide-tables',
        stepKey: 'tide-tables:1',
        nextState: 'ready',
        errors: 1,
        errorLimit: 3,
        claimableAt: 0,
      }),
    },
    6.5,
  ],
  [
    "the step's interrupt, so the turn record is its retry's",
    {
      kind: taskStepInterruptedCodec.kind,
      payload: taskStepInterruptedCodec.encode({ taskID: 'tide-tables', stepKey: 'tide-tables:1' }),
    },
    6.5,
  ],
])('it counts the dollars of a pause followed by %s', async (_case, between, dollars) => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: taskLimitReachedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'tide-tables',
      payload: taskLimitReachedCodec.encode({
        taskID: 'tide-tables',
        stepKey: 'tide-tables:1',
        used: { turns: 1, dollars: 3.5 },
        limits: { turns: 25, dollars: 2 },
      }),
    },
    { ...between, definitions: { snapshotHash: 'sha256:test' }, thread: 'tide-tables' },
    {
      kind: modelTurnEndedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'tide-tables',
      payload: modelTurnEndedCodec.encode({
        model: 'claude-test',
        profile: 'task-direct',
        stopReason: 'end_turn',
        turns: 1,
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        pinnedCore: [],
        retrieved: [],
        invalidatedThrough: 0,
        sessionImageBytes: 0,
        sessionImageCount: 0,
      }),
    },
    {
      kind: taskStepCommittedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'tide-tables',
      stepKey: 'tide-tables:1',
      payload: taskStepCommittedCodec.encode({
        taskID: 'tide-tables',
        nextState: 'ready',
        readCursor: 0,
        sessionBoundary: null,
        timers: [],
      }),
    },
  ]);

  const used = await readTaskUsage(ctx.tasks.context, 'tide-tables', {
    input: 3,
    cacheWrite: 3.75,
    cacheWrite1h: 6,
    cachedInput: 0.3,
    output: 15,
  });

  expect(used).toStrictEqual({ turns: 1, dollars });
});
