import { expect, mock, test } from 'bun:test';
import { defaultAPISettings } from '@heynixie/api';
import { readLinkTarget } from '@heynixie/connectors';
import { readRecords, withWriteTransaction, writeRecords } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { createConversationTask } from '@heynixie/tasks';
import { buildSeeder } from '../test-utils/build-seeder';
import { runTestSeed } from '../test-utils/run-test-seed';
import { startTestServer } from '../test-utils/start-test-server';
import { runConversationReset } from './run-conversation-reset';

async function setupTest() {
  const server = await startTestServer();

  const context = {
    ...server.context,
    settings: defaultAPISettings,
    readSessionCleanup: () => null,
  };

  return {
    ...server,
    context,
    seed: buildSeeder({ context }),
    log: mock<Logger>(),
    clearFetchPauses: mock<() => void>(),
    removeTurnInputThreads: mock<(threads: readonly string[]) => Promise<void>>(() =>
      Promise.resolve(),
    ),
  };
}

test('it removes the logged requests of the conversation thread before it records the reset', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);

  const kindsAtRemoval: string[][] = [];

  await runConversationReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => Promise.resolve(),
    log: ctx.log,
    clearFetchPauses: ctx.clearFetchPauses,
    removeTurnInputThreads: async (threads) => {
      await ctx.removeTurnInputThreads(threads);

      const read = await readRecords(ctx.context.log, { afterSequence: 0 });

      kindsAtRemoval.push(read.map((entry) => entry.record.kind));
    },
  });

  expect(ctx.removeTurnInputThreads).toHaveBeenCalledExactlyOnceWith(['conversation']);
  expect(kindsAtRemoval).toStrictEqual([['definitions_seeded', 'model.session_invalidated']]);
});

test('it clears every web fetch pause', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);

  await runConversationReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => Promise.resolve(),
    log: ctx.log,
    removeTurnInputThreads: ctx.removeTurnInputThreads,
    clearFetchPauses: ctx.clearFetchPauses,
  });

  expect(ctx.clearFetchPauses).toHaveBeenCalledOnce();
});

test('it records no reset when a logged request cannot be removed', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);

  const reset = runConversationReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => Promise.resolve(),
    log: ctx.log,
    clearFetchPauses: ctx.clearFetchPauses,
    removeTurnInputThreads: () =>
      Promise.reject(new Error('1 logged requests could not be removed')),
  });

  await Promise.allSettled([reset]);

  const read = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(reset).rejects.toThrowWithMessage(Error, '1 logged requests could not be removed');

  expect(read.map((entry) => entry.record.kind)).toStrictEqual([
    'definitions_seeded',
    'model.session_invalidated',
  ]);
});

test('it shreds every record on the conversation thread, records the reset there, and reports its key backups as pending', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);
  await createConversationTask(ctx.context);

  await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the ferry leaves at six' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'I will remind you at five.' },
    },
  ]);

  const reset = await runConversationReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => Promise.resolve(),
    log: ctx.log,
    removeTurnInputThreads: ctx.removeTurnInputThreads,
    clearFetchPauses: ctx.clearFetchPauses,
  });

  const read = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(reset).toStrictEqual({
    resetAt: expect.toBeValidDate(),
    lastSequence: 5,
    shreddedRecords: 2,
    backup: { state: 'pending' },
  });

  expect(read.map((entry) => entry.record).slice(2)).toMatchObject([
    { sequence: 3, kind: 'owner_message', erasable: { status: 'shredded' } },
    { sequence: 4, kind: 'model.reply', erasable: { status: 'shredded' } },
    { sequence: 5, kind: 'model.session_invalidated', thread: 'conversation', payload: {} },
    {
      sequence: 6,
      kind: 'log_reset',
      thread: 'conversation',
      definitions: ctx.context.definitions(),
      payload: {
        resetAt: reset.resetAt.getTime(),
        lastSequence: 5,
        mode: 'conversations',
        shreddedRecords: 2,
      },
      erasable: { status: 'none' },
    },
  ]);
});

test('it finishes the reset and reports its key backups as unknown when the backup state read fails', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);

  await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the ferry leaves at six' },
    },
  ]);

  await withWriteTransaction(ctx.context.log.writer, async (tx) => {
    await tx.schema.dropTable('backup_sets').execute();
  });

  const reset = await runConversationReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => Promise.resolve(),
    log: ctx.log,
    removeTurnInputThreads: ctx.removeTurnInputThreads,
    clearFetchPauses: ctx.clearFetchPauses,
  });

  const read = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(reset).toStrictEqual({
    resetAt: expect.toBeValidDate(),
    lastSequence: 3,
    shreddedRecords: 1,
    backup: { state: 'unknown' },
  });

  expect(ctx.log).toHaveBeenCalledExactlyOnceWith('reset.backup_state_failed', {
    error: expect.any(String),
    message: expect.stringMatching(/backup_sets/u),
  });

  expect(read.map((entry) => [entry.record.kind, entry.record.erasable.status])).toStrictEqual([
    ['definitions_seeded', 'none'],
    ['owner_message', 'shredded'],
    ['model.session_invalidated', 'none'],
    ['log_reset', 'none'],
  ]);
});

test('it never shreds a record on another thread', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);

  await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'task-garden',
      erasable: { text: 'water the tomatoes' },
    },
  ]);

  await runConversationReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => Promise.resolve(),
    log: ctx.log,
    removeTurnInputThreads: ctx.removeTurnInputThreads,
    clearFetchPauses: ctx.clearFetchPauses,
  });

  const read = await readRecords(ctx.context.log, { afterSequence: 0, thread: 'task-garden' });

  expect(read.map((entry) => entry.record.erasable)).toStrictEqual([
    { status: 'readable', fields: { text: 'water the tomatoes' } },
  ]);
});

test('it stops the work, then destroys the conversation sandbox and never another', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);

  const conversation = await ctx.sandboxes.create(
    buildMockSandboxSpec({ kind: 'conversation', image: 'conversation', owner: 'conversation' }),
  );

  const worker = await ctx.sandboxes.create(
    buildMockSandboxSpec({ kind: 'worker', image: 'worker', owner: 'task-garden' }),
  );

  const stopWork = mock(() => Promise.resolve());

  const before = await ctx.readSandboxIDs();

  await runConversationReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork,
    log: ctx.log,
    removeTurnInputThreads: ctx.removeTurnInputThreads,
    clearFetchPauses: ctx.clearFetchPauses,
  });

  const after = await ctx.readSandboxIDs();

  expect(stopWork).toHaveBeenCalledOnce();
  expect(before).toIncludeSameMembers([conversation.id, worker.id]);
  expect(after).toStrictEqual([worker.id]);
});

test('it removes the links that the web fetch tool numbered on the conversation thread', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);

  await ctx.seed.webFetchLinks({
    sessionKey: 'session-a',
    thread: 'conversation',
    urls: ['https://pier.test/timetable'],
  });

  await runConversationReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => Promise.resolve(),
    log: ctx.log,
    removeTurnInputThreads: ctx.removeTurnInputThreads,
    clearFetchPauses: ctx.clearFetchPauses,
  });

  const target = await readLinkTarget(ctx.context.log, { sessionKey: 'session-a', number: 1 });

  expect(target).toBeNull();
});

test('it removes nothing when the conversation sandbox destroy fails', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);

  await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'book the dentist' },
    },
  ]);

  const reset = runConversationReset({
    context: ctx.context,
    adapter: {
      id: 'process',
      list: () =>
        Promise.resolve([
          { destroy: () => Promise.reject(new Error('the runtime refused the destroy')) },
        ]),
    },
    stopWork: () => Promise.resolve(),
    log: ctx.log,
    removeTurnInputThreads: ctx.removeTurnInputThreads,
    clearFetchPauses: ctx.clearFetchPauses,
  });

  await Promise.allSettled([reset]);

  const read = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(reset).rejects.toThrowWithMessage(Error, 'the runtime refused the destroy');

  expect(read.map((entry) => [entry.record.kind, entry.record.erasable.status])).toStrictEqual([
    ['definitions_seeded', 'none'],
    ['owner_message', 'readable'],
  ]);
});

test('it destroys the code sandboxes of the conversation calls', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);
  await createConversationTask(ctx.context);

  await writeRecords(ctx.context.log, [
    {
      kind: 'tool_called',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { callID: 'call-1', runID: 'run-1', toolUseID: null, tool: 'code.run' },
      erasable: { input: { program: 'print(1)' } },
    },
  ]);

  const codeSandbox = await ctx.sandboxes.create(
    buildMockSandboxSpec({
      kind: 'code_run',
      image: 'code',
      owner: 'code_run:call-1',
      toolRoute: false,
    }),
  );

  const before = await ctx.readSandboxIDs();

  await runConversationReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => Promise.resolve(),
    log: ctx.log,
    removeTurnInputThreads: ctx.removeTurnInputThreads,
    clearFetchPauses: ctx.clearFetchPauses,
  });

  const after = await ctx.readSandboxIDs();

  expect(before).toStrictEqual([codeSandbox.id]);
  expect(after).toStrictEqual([]);
});

test('it removes no key when a code sandbox will not go', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);
  await createConversationTask(ctx.context);

  await writeRecords(ctx.context.log, [
    {
      kind: 'tool_called',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { callID: 'call-1', runID: 'run-1', toolUseID: null, tool: 'code.run' },
      erasable: { input: { program: 'print(1)' } },
    },
  ]);

  const [outcome] = await Promise.allSettled([
    runConversationReset({
      context: ctx.context,
      adapter: {
        id: 'process',
        list: (owner) => {
          const refusing = [
            { destroy: () => Promise.reject(new Error('the runtime refused the destroy')) },
          ];

          const sandboxes = owner === 'code_run:call-1' ? refusing : [];

          return Promise.resolve(sandboxes);
        },
      },
      stopWork: () => Promise.resolve(),
      log: ctx.log,
      removeTurnInputThreads: ctx.removeTurnInputThreads,
      clearFetchPauses: ctx.clearFetchPauses,
    }),
  ]);

  const read = await readRecords(ctx.context.log, { afterSequence: 0 });

  const toolCall = read.find((entry) => entry.record.kind === 'tool_called');

  expect(outcome).toMatchObject({
    status: 'rejected',
    reason: {
      message: 'nixie could not destroy a code sandbox that holds this text. Try the forget again.',
    },
  });

  expect(toolCall?.record.erasable.status).toBe('readable');
});
