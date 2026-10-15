import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { buildMockSandboxSpec, buildStubSandboxes } from '@heynixie/sandbox/test-utils';
import { runSessionCompaction } from './run-session-compaction';

// A worker task's model loop on the stub sandbox, with no compaction settings, which each test sets.
async function setupTest() {
  const log = await startTestLog();

  const sandboxes = buildStubSandboxes();

  const sandbox = await sandboxes.adapter.create(buildMockSandboxSpec({ kind: 'worker' }));

  const run = {
    context: { log: log.log, definitions: () => ({ snapshotHash: 'sha256:test' }) },
    model: { model: 'claude-test', profile: 'task-direct' },
    turnProfile: {
      model: 'claude-test',
      baseURL: 'https://models.example.test',
      effort: 'medium',
      authHeader: 'x-api-key',
      contextTokens: null,
    },
    sandbox,
    command: { argv: ['guest'], env: {} },
  } as const;

  return { log, sandboxes, run };
}

test('it summarizes a task session and returns the summary record through its last turn end', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log.log, [
    { kind: 'model.turn_ended', definitions: { snapshotHash: 'sha256:test' }, thread: 'task-7' },
  ]);

  const outcome = await runSessionCompaction(
    { ...ctx.run, compaction: { threshold: 0.8, summaryTokens: 2000 } },
    {
      taskID: 'task-7',
      resume: {
        sessionID: '0b6f1c52-3a1e-4f7e-9c2d-5e8a7b1c4d01',
        messageID: '6a2e9f41-7c3b-4d8e-a1f5-2b9c8d7e6f09',
      },
      trigger: 'threshold',
      contextSize: 170_000,
      failures: 0,
      signal: new AbortController().signal,
      systemPrompt: 'You sort the receipts of a trip.',
      at: 'Tue 14 Oct, 22:50, Sydney',
      ownerName: 'Robin',
    },
  );

  expect(outcome).toStrictEqual({
    isSummarized: true,
    record: {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      payload: {
        model: 'claude-test',
        profile: 'task-direct',
        throughSequence: 1,
        boundary: {
          sessionID: '0b6f1c52-3a1e-4f7e-9c2d-5e8a7b1c4d01',
          messageID: '6a2e9f41-7c3b-4d8e-a1f5-2b9c8d7e6f09',
        },
        trigger: 'threshold',
        contextSize: 170_000,
        summaryTokens: expect.toBeNumber(),
        isCut: false,
      },
      erasable: { text: 'Open threads: none.' },
    },
  });
});

test('it sends the summary call the task profile, the system prompt and an instruction stamped with the time', async () => {
  const ctx = await setupTest();

  await runSessionCompaction(
    { ...ctx.run, compaction: { threshold: 0.8, summaryTokens: 2000 } },
    {
      taskID: 'task-7',
      resume: {
        sessionID: '0b6f1c52-3a1e-4f7e-9c2d-5e8a7b1c4d01',
        messageID: '6a2e9f41-7c3b-4d8e-a1f5-2b9c8d7e6f09',
      },
      trigger: 'threshold',
      contextSize: 170_000,
      failures: 0,
      signal: new AbortController().signal,
      systemPrompt: 'You sort the receipts of a trip.',
      at: 'Tue 14 Oct, 22:50, Sydney',
      ownerName: 'Robin',
    },
  );

  expect(ctx.sandboxes.summaries).toStrictEqual([
    {
      type: 'summarize',
      profile: ctx.run.turnProfile,
      resume: {
        sessionID: '0b6f1c52-3a1e-4f7e-9c2d-5e8a7b1c4d01',
        messageID: '6a2e9f41-7c3b-4d8e-a1f5-2b9c8d7e6f09',
      },
      systemPrompt: 'You sort the receipts of a trip.',
      instruction: expect.toInclude('at="Tue 14 Oct, 22:50, Sydney"'),
    },
  ]);
});

test('it asks once, on the summary fork, to cut a summary past the cap', async () => {
  const ctx = await setupTest();

  const long = 'The ferry to the island leaves at nine, and the hostel holds the bags. '.repeat(40);

  ctx.sandboxes.setSummaryScript((frame) => [
    {
      type: 'summarized',
      boundary: {
        sessionID: 'c3d4e5f6-1a2b-4c3d-8e4f-5a6b7c8d9e02',
        messageID: '9e8d7c6b-5a4f-4e3d-9c2b-1a0f9e8d7c10',
      },
      text: frame.instruction.includes('past the cap') ? 'The ferry leaves at nine.' : long,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);

  const outcome = await runSessionCompaction(
    { ...ctx.run, compaction: { threshold: 0.8, summaryTokens: 100 } },
    {
      taskID: 'task-7',
      resume: {
        sessionID: '0b6f1c52-3a1e-4f7e-9c2d-5e8a7b1c4d01',
        messageID: '6a2e9f41-7c3b-4d8e-a1f5-2b9c8d7e6f09',
      },
      trigger: 'overflow',
      contextSize: null,
      failures: 0,
      signal: new AbortController().signal,
      systemPrompt: 'You sort the receipts of a trip.',
      at: 'Tue 14 Oct, 22:50, Sydney',
      ownerName: null,
    },
  );

  expect(outcome.record).toMatchObject({
    payload: { throughSequence: 0, trigger: 'overflow', isCut: true },
    erasable: { text: 'The ferry leaves at nine.' },
  });

  expect(ctx.sandboxes.summaries.at(1)?.resume).toStrictEqual({
    sessionID: 'c3d4e5f6-1a2b-4c3d-8e4f-5a6b7c8d9e02',
    messageID: '9e8d7c6b-5a4f-4e3d-9c2b-1a0f9e8d7c10',
  });
});

test('it returns a failure record with the count in a row when the summary call fails', async () => {
  const ctx = await setupTest();

  ctx.sandboxes.setSummaryScript(() => [
    { type: 'failed', reason: 'error', detail: 'the summary call ended with no summary' },
  ]);

  const outcome = await runSessionCompaction(
    { ...ctx.run, compaction: { threshold: 0.8, summaryTokens: 2000 } },
    {
      taskID: 'task-7',
      resume: {
        sessionID: '0b6f1c52-3a1e-4f7e-9c2d-5e8a7b1c4d01',
        messageID: '6a2e9f41-7c3b-4d8e-a1f5-2b9c8d7e6f09',
      },
      trigger: 'threshold',
      contextSize: 170_000,
      failures: 2,
      signal: new AbortController().signal,
      systemPrompt: 'You sort the receipts of a trip.',
      at: 'Tue 14 Oct, 22:50, Sydney',
      ownerName: null,
    },
  );

  expect(outcome).toStrictEqual({
    isSummarized: false,
    record: {
      kind: 'model.compaction_failed',
      definitions: { snapshotHash: 'sha256:test' },
      payload: {
        model: 'claude-test',
        profile: 'task-direct',
        trigger: 'threshold',
        failures: 3,
        contextSize: 170_000,
      },
      erasable: {
        message: 'the summary call failed: error: the summary call ended with no summary',
      },
    },
  });
});

test('it throws the abort reason instead of a failure record when the signal aborts', async () => {
  const ctx = await setupTest();

  const compaction = runSessionCompaction(
    { ...ctx.run, compaction: { threshold: 0.8, summaryTokens: 2000 } },
    {
      taskID: 'task-7',
      resume: {
        sessionID: '0b6f1c52-3a1e-4f7e-9c2d-5e8a7b1c4d01',
        messageID: '6a2e9f41-7c3b-4d8e-a1f5-2b9c8d7e6f09',
      },
      trigger: 'threshold',
      contextSize: 170_000,
      failures: 0,
      signal: AbortSignal.abort(new Error('the task lost its lease')),
      systemPrompt: 'You sort the receipts of a trip.',
      at: 'Tue 14 Oct, 22:50, Sydney',
      ownerName: null,
    },
  );

  expect(compaction).rejects.toThrow('the task lost its lease');
});
