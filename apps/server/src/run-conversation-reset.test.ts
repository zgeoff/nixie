import { expect, mock, test } from 'bun:test';
import { defaultAPISettings } from '@heynixie/api';
import { readLinkTarget } from '@heynixie/connectors';
import { readRecords, withWriteTransaction, writeRecords } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { createConversationTask } from '@heynixie/tasks';
import { runConversationReset } from './run-conversation-reset';
import { runTestSeed } from './test-utils/run-test-seed';
import { startTestServer } from './test-utils/start-test-server';

async function setupTest() {
  const server = await startTestServer();

  const context = {
    ...server.context,
    settings: defaultAPISettings,
    readSessionCleanup: () => null,
  };

  return { ...server, context, log: mock<Logger>() };
}

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
  });

  const after = await ctx.readSandboxIDs();

  expect(stopWork).toHaveBeenCalledOnce();
  expect(before).toIncludeSameMembers([conversation.id, worker.id]);
  expect(after).toStrictEqual([worker.id]);
});

test('it removes the links that the web fetch tool numbered on the conversation thread', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);

  await withWriteTransaction(ctx.context.log.writer, async (tx) => {
    await tx
      .$extendTables<{
        web_fetch_links: { session_key: string; number: number; url: string; thread: string };
      }>()
      .insertInto('web_fetch_links')
      .values({
        session_key: 'session-a',
        number: 1,
        url: 'https://pier.test/timetable',
        thread: 'conversation',
      })
      .execute();
  });

  await runConversationReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => Promise.resolve(),
    log: ctx.log,
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
  });

  await Promise.allSettled([reset]);

  const read = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(reset).rejects.toThrowWithMessage(Error, 'the runtime refused the destroy');

  expect(read.map((entry) => [entry.record.kind, entry.record.erasable.status])).toStrictEqual([
    ['definitions_seeded', 'none'],
    ['owner_message', 'readable'],
  ]);
});
