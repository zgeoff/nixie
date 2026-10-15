import { expect, mock, test } from 'bun:test';
import { defaultAPISettings } from '@heynixie/api';
import { readRecords, writeRecords } from '@heynixie/log';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { createConversationTask, startTaskRunners } from '@heynixie/tasks';
import { makeGatedCall } from '@heynixie/testing';
import { runServerReset } from './run-server-reset';
import { runTestSeed } from './test-utils/run-test-seed';
import { startTestServer } from './test-utils/start-test-server';

// boot data: a reset needs definitions in force, and every start seeds and creates the
// conversation task before its runners claim work
async function setupTest() {
  const server = await startTestServer();

  const context = {
    ...server.context,
    settings: defaultAPISettings,
    readSessionCleanup: () => null,
  };

  const seeded = await runTestSeed(context.log, server.dataDir);

  await createConversationTask(context);

  return { ...server, context, seeded };
}

test('it starts the new log with the definitions in force, then the reset on the conversation thread', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.context.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' }, thread: 'conversation' },
  ]);

  const reset = await runServerReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => Promise.resolve(),
  });

  const read = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(read.map((entry) => entry.record)).toMatchObject([
    {
      sequence: 4,
      kind: 'definitions_seeded',
      thread: null,
      definitions: { snapshotHash: ctx.seeded.inForce?.snapshotHash },
    },
    {
      sequence: 5,
      kind: 'log_reset',
      thread: 'conversation',
      definitions: { snapshotHash: ctx.seeded.inForce?.snapshotHash },
      payload: {
        resetAt: reset.resetAt.getTime(),
        lastSequence: 3,
        mode: 'full',
        keptSessions: 0,
      },
      erasable: { status: 'none' },
    },
  ]);
});

test('it destroys every sandbox before it resets', async () => {
  const ctx = await setupTest();

  const sandbox = await ctx.sandboxes.create(
    buildMockSandboxSpec({ kind: 'conversation', image: 'conversation', owner: 'conversation' }),
  );

  const before = await ctx.readSandboxIDs();

  await runServerReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => Promise.resolve(),
  });

  const after = await ctx.readSandboxIDs();

  expect(before).toStrictEqual([sandbox.id]);
  expect(after).toStrictEqual([]);
});

test('it removes nothing from the database or the key store when a sandbox destroy fails', async () => {
  const ctx = await setupTest();

  await ctx.sandboxes.create(
    buildMockSandboxSpec({ kind: 'conversation', image: 'conversation', owner: 'conversation' }),
  );

  await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'book the dentist' },
    },
  ]);

  const reset = runServerReset({
    context: ctx.context,
    adapter: {
      id: 'process',
      list: () =>
        Promise.resolve([
          { destroy: () => Promise.reject(new Error('the runtime refused the destroy')) },
        ]),
    },
    stopWork: () => Promise.resolve(),
  });

  await Promise.allSettled([reset]);

  const read = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(reset).rejects.toThrowWithMessage(Error, 'the runtime refused the destroy');

  expect(read.map((entry) => [entry.record.sequence, entry.record.kind])).toStrictEqual([
    [1, 'definitions_seeded'],
    [2, 'task.created'],
    [3, 'sandbox.created'],
    [4, 'owner_message'],
  ]);

  expect(read.at(-1)?.record.erasable).toStrictEqual({
    status: 'readable',
    fields: { text: 'book the dentist' },
  });
});

test('it refuses a reset before any definitions are in force, and stops no work', async () => {
  const server = await startTestServer();

  const stopWork = mock(() => Promise.resolve());

  const reset = runServerReset({
    context: { ...server.context, settings: defaultAPISettings, readSessionCleanup: () => null },
    adapter: server.sandboxes,
    stopWork,
  });

  await Promise.allSettled([reset]);

  expect(reset).rejects.toThrowWithMessage(
    Error,
    'no definitions are in force yet, so the reset has nothing to start from',
  );

  expect(stopWork).not.toHaveBeenCalled();
});

// the reset waits out a grace of 50 ms in place of the 30 s default, which the pool takes the
// same way; the turn starts before the reset and its gate opens only after the reset returns
test('it commits nothing of a turn still running at the end of the stop grace', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.context.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' }, thread: 'conversation' },
  ]);

  const turn = makeGatedCall(() =>
    Promise.resolve({
      next: 'wait' as const,
      records: [
        {
          kind: 'model.reply',
          definitions: { snapshotHash: 'sha256:test' },
          thread: 'conversation',
          erasable: { text: 'Your dentist is booked.' },
        },
      ],
      acknowledged: [],
    }),
  );

  const runners = startTaskRunners(ctx.context, {
    runStep: turn.call,
    onStepErrored: mock<Parameters<typeof startTaskRunners>[1]['onStepErrored']>(),
    onError: mock<Parameters<typeof startTaskRunners>[1]['onError']>(),
    size: 1,
  });

  ctx.defer(() => runners.stop());

  await turn.started;

  const reset = await runServerReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => runners.stop(50),
  });

  turn.release();

  const read = await runners
    .stop()
    .then(() => readRecords(ctx.context.log, { afterSequence: reset.lastSequence }));

  expect(read.map((entry) => entry.record.kind)).toStrictEqual(['definitions_seeded', 'log_reset']);
});

test('it folds the reset on the conversation thread, which the conversation task the start creates again takes up', async () => {
  const ctx = await setupTest();

  const reset = await runServerReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => Promise.resolve(),
  });

  await createConversationTask(ctx.context);

  const thread = await readRecords(ctx.context.log, { afterSequence: 0, thread: 'conversation' });

  const tasks = await ctx.context.log.writer.db
    .$extendTables<{ tasks: { task_id: string; created_sequence: number } }>()
    .selectFrom('tasks')
    .select(['task_id', 'created_sequence'])
    .execute();

  expect(thread.map((entry) => [entry.record.sequence, entry.record.kind])).toStrictEqual([
    [reset.lastSequence + 2, 'log_reset'],
    [reset.lastSequence + 3, 'task.created'],
  ]);

  expect(tasks).toStrictEqual([
    { task_id: 'conversation', created_sequence: reset.lastSequence + 3 },
  ]);
});
