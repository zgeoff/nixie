import { expect, mock, test } from 'bun:test';
import { createClientRegistry, createPasskeyState, defaultAPISettings } from '@heynixie/api';
import { readLinkTarget } from '@heynixie/connectors';
import type { ErasureFaultPoint } from '@heynixie/log';
import { readRecords, withWriteTransaction, writeRecords } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { createConversationTask } from '@heynixie/tasks';
import { buildSeeder } from '../test-utils/build-seeder';
import { runTestSeed } from '../test-utils/run-test-seed';
import { startTestConversationReset } from '../test-utils/start-test-conversation-reset';
import { startTestServer } from '../test-utils/start-test-server';

type ResetOptions = Parameters<typeof startTestConversationReset>[1];

async function setupTest() {
  const server = await startTestServer();

  const context = {
    ...server.context,
    settings: defaultAPISettings,
    readZone: () => Promise.resolve('UTC'),
    features: [],
    passkeys: createPasskeyState(),
    clients: createClientRegistry({ clock: server.context.clock }),
  };

  const log = mock<Logger>();
  const stopWork = mock(() => Promise.resolve());
  const clearFetchPauses = mock<() => void>();

  return {
    ...server,
    context,
    seed: buildSeeder({ context }),
    log,
    stopWork,
    clearFetchPauses,
    start: (options: Partial<ResetOptions> = {}) =>
      startTestConversationReset(context, {
        adapter: server.sandboxes,
        log,
        stopWork,
        clearFetchPauses,
        ...options,
      }),
    readKinds: async () => {
      const read = await readRecords(context.log, { afterSequence: 0 });

      return read.map((entry) => entry.record.kind);
    },
  };
}

test('it removes the logged requests of the conversation thread before it records the reset', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);

  const scopes: { threads: readonly string[]; kinds: string[] }[] = [];

  const reset = ctx.start({
    removeTurnInputs: async (scope) => {
      scopes.push({ threads: scope.threads, kinds: await ctx.readKinds() });
    },
  });

  await reset.run();

  expect(scopes).toStrictEqual([
    {
      threads: ['conversation'],
      kinds: ['definitions_seeded', 'model.session_invalidated', 'erasure.started'],
    },
  ]);
});

test('it clears every web fetch pause', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);

  await ctx.start().run();

  expect(ctx.clearFetchPauses).toHaveBeenCalled();
});

test('it records no reset when a logged request cannot be removed, and a rerun finishes it', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);

  const failing = { isFailing: true };

  const reset = ctx.start({
    removeTurnInputs: () =>
      failing.isFailing
        ? Promise.reject(new Error('1 logged requests could not be removed'))
        : Promise.resolve(),
  });

  const first = reset.run();

  await Promise.allSettled([first]);

  const kindsAfterFailure = await ctx.readKinds();

  failing.isFailing = false;

  await reset.run();

  const kindsAfterRerun = await ctx.readKinds();

  expect(first).rejects.toThrowWithMessage(Error, '1 logged requests could not be removed');

  expect(kindsAfterFailure).toStrictEqual([
    'definitions_seeded',
    'model.session_invalidated',
    'erasure.started',
  ]);

  expect(kindsAfterRerun).toStrictEqual([
    'definitions_seeded',
    'model.session_invalidated',
    'erasure.started',
    'model.session_invalidated',
    'erasure.finished',
    'log_reset',
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

  const reset = await ctx.start().run();
  const read = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(reset).toStrictEqual({
    resetAt: expect.toBeValidDate(),
    lastSequence: 5,
    removedKeys: 2,
    shreddedRecords: 2,
    backup: { state: 'pending' },
  });

  expect(read.map((entry) => entry.record).slice(2)).toMatchObject([
    { sequence: 3, kind: 'owner_message', erasable: { status: 'shredded' } },
    { sequence: 4, kind: 'model.reply', erasable: { status: 'shredded' } },
    { sequence: 5, kind: 'model.session_invalidated', thread: 'conversation', payload: {} },
    { sequence: 6, kind: 'erasure.started', payload: { kind: 'conversation', keyCount: 2 } },
    {
      sequence: 7,
      kind: 'erasure.finished',
      payload: { kind: 'conversation', targetID: 'conversation', removedKeys: 2 },
    },
    {
      sequence: 8,
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

test('it writes neither erasure.finished nor log_reset before the turn inputs are removed', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);

  const reset = ctx.start();

  reset.effects.crashAt('erasure.turn_inputs_removed');

  const failed = reset.run();

  await Promise.allSettled([failed]);

  expect(failed).rejects.toThrow('crash at erasure.turn_inputs_removed');

  const kinds = await ctx.readKinds();

  expect(kinds).not.toContain('log_reset');
  expect(kinds).not.toContain('erasure.finished');
});

test.each<ErasureFaultPoint>([
  'erasure.begun',
  'erasure.revoked',
  'erasure.sandboxes_destroyed',
  'erasure.keys_removed',
  'erasure.cleaned',
  'erasure.turn_inputs_removed',
])('it finishes at the next start a reset that a crash at %s cut short', async (point) => {
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

  const reset = ctx.start();

  reset.effects.crashAt(point);

  const failed = reset.run();

  await Promise.allSettled([failed]);

  expect(failed).rejects.toThrow(`crash at ${point}`);

  await ctx.start().runner.finishOpen();

  const read = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(read.map((entry) => [entry.record.kind, entry.record.erasable.status])).toStrictEqual([
    ['definitions_seeded', 'none'],
    ['owner_message', 'shredded'],
    ['model.session_invalidated', 'none'],
    ['erasure.started', 'none'],
    ['erasure.finished', 'none'],
    ['log_reset', 'none'],
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

  const reset = await ctx.start().run();
  const kinds = await ctx.readKinds();

  expect(reset).toStrictEqual({
    resetAt: expect.toBeValidDate(),
    lastSequence: 3,
    removedKeys: 1,
    shreddedRecords: 1,
    backup: { state: 'unknown' },
  });

  expect(ctx.log).toHaveBeenCalledExactlyOnceWith('reset.backup_state_failed', {
    error: expect.any(String),
    message: expect.stringMatching(/backup_sets/u),
  });

  expect(kinds).toStrictEqual([
    'definitions_seeded',
    'owner_message',
    'model.session_invalidated',
    'erasure.started',
    'erasure.finished',
    'log_reset',
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

  await ctx.start().run();

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

  const before = await ctx.readSandboxIDs();

  await ctx.start().run();

  const after = await ctx.readSandboxIDs();

  expect(ctx.stopWork).toHaveBeenCalledOnce();
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

  await ctx.start().run();

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

  const reset = ctx
    .start({
      adapter: {
        id: 'process',
        list: () =>
          Promise.resolve([
            {
              id: 'nixie-stuck',
              spec: buildMockSandboxSpec({ owner: 'conversation' }),
              destroy: () => Promise.reject(new Error('the runtime refused the destroy')),
            },
          ]),
      },
    })
    .run();

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

  await ctx.start().run();

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
    ctx
      .start({
        adapter: {
          id: 'process',
          list: (owner) => {
            const refusing = [
              {
                id: 'nixie-stuck',
                spec: buildMockSandboxSpec({ owner: 'conversation' }),
                destroy: () => Promise.reject(new Error('the runtime refused the destroy')),
              },
            ];

            const sandboxes = owner === 'code_run:call-1' ? refusing : [];

            return Promise.resolve(sandboxes);
          },
        },
      })
      .run(),
  ]);

  const read = await readRecords(ctx.context.log, { afterSequence: 0 });

  const toolCall = read.find((entry) => entry.record.kind === 'tool_called');

  expect(outcome).toMatchObject({ status: 'rejected' });
  expect(toolCall?.record.erasable.status).toBe('readable');
});
