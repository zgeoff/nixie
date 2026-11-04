import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { modelSessionSummarizedCodec, modelTurnEndedCodec } from '@heynixie/models';
import { readTaskUsage } from './read-task-usage';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  return { tasks: await startTestTasks() };
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
