import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { clientHeaderName } from '@heynixie/contract';
import { writeRecords } from '@heynixie/log';
import { buildTestClient } from './build-test-client';
import { createDeviceSession } from './create-device-session';
import { startTestAPI } from './start-test-api';

test('it serves the API on a loopback port', async () => {
  const ctx = await startTestAPI();

  const response = await fetch(`${ctx.url}/rpc/sessions/list`, {
    method: 'POST',
    headers: { [clientHeaderName]: 'test', 'content-type': 'application/json' },
    body: '{}',
  });

  expect(response.status).toBe(401);
});

test('it serves no memory store until the test sets one', async () => {
  const ctx = await startTestAPI();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const read = buildTestClient(ctx.url, laptop.token).memory.readPinnedCore();

  await read.catch(() => {});

  expect(read).rejects.toMatchObject({ code: 'MEMORY_NOT_STARTED' });
});

test('it serves the memory store the test sets', async () => {
  const ctx = await startTestAPI();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  ctx.setMemory({
    retire: () => Promise.reject(new Error('no change runs here')),
    restore: () => Promise.reject(new Error('no change runs here')),
    undo: () => Promise.reject(new Error('no change runs here')),
    keep: () => Promise.reject(new Error('no change runs here')),
    pin: () => Promise.reject(new Error('no change runs here')),
    forget: () => Promise.reject(new Error('no change runs here')),
    finishForget: () => Promise.reject(new Error('no change runs here')),
    forgetRetired: () => Promise.reject(new Error('no change runs here')),
    finishForgets: () => Promise.reject(new Error('no change runs here')),
    proposals: {
      approve: () => Promise.reject(new Error('no answer runs here')),
      reject: () => Promise.reject(new Error('no answer runs here')),
    },
    moments: {
      keep: () => Promise.reject(new Error('no change runs here')),
      readDestroyPreview: () => Promise.reject(new Error('no preview runs here')),
      destroy: () => Promise.reject(new Error('no change runs here')),
      finishDestroy: () => Promise.reject(new Error('no change runs here')),
    },
    view: {
      readPage: () => Promise.resolve({ items: [], next: null }),
      readMatchingItems: () => Promise.resolve({ items: [], searchMode: 'keyword' }),
      readPinnedCore: () => Promise.resolve({ items: [], tokens: 0, budget: 750 }),
      readItem: () => Promise.resolve(null),
      readProposals: () => Promise.resolve([]),
      readForgetPreview: () => Promise.reject(new Error('no preview runs here')),
      readRetiredForgetPreview: () => Promise.reject(new Error('no preview runs here')),
      readForgetStatus: () => Promise.reject(new Error('no status read runs here')),
      async *readExport() {},
      readNotices: () => Promise.resolve([]),
    },
  });

  const core = await buildTestClient(ctx.url, laptop.token).memory.readPinnedCore();

  expect(core).toStrictEqual({ items: [], tokens: 0, budget: 750 });
});

test('it starts with no task and the test clock', async () => {
  const ctx = await startTestAPI();

  const tasks = await ctx.writer.db
    .$extendTables<{ tasks: { task_id: string } }>()
    .selectFrom('tasks')
    .select('task_id')
    .execute();

  expect(tasks).toStrictEqual([]);
  expect(ctx.clock.now()).toBe(1_000_000);
});

test('it serves the API with the settings the test gives', async () => {
  const ctx = await startTestAPI({
    enrolmentCodeLifetimeMs: 60_000,
    sessionIdleMs: 3_600_000,
    refusalIntervalMs: 60_000,
    lastSeenIntervalMs: 1000,
    isMemoryWriterEnabled: false,
    isMemoryConsolidatorEnabled: false,
  });

  expect(ctx.context.settings).toStrictEqual({
    enrolmentCodeLifetimeMs: 60_000,
    sessionIdleMs: 3_600_000,
    refusalIntervalMs: 60_000,
    lastSeenIntervalMs: 1000,
    isMemoryWriterEnabled: false,
    isMemoryConsolidatorEnabled: false,
  });
});

test("it folds the memory writer's records into its row", async () => {
  const ctx = await startTestAPI();

  await writeRecords(ctx.context.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 3, at: 1_000_000 },
    },
  ]);

  const row = await ctx.writer.db
    .$extendTables<{ memory_writer: { writer_id: string; start_sequence: number } }>()
    .selectFrom('memory_writer')
    .select(['writer_id', 'start_sequence'])
    .executeTakeFirst();

  expect(row).toStrictEqual({ writer_id: 'memory-writer', start_sequence: 3 });
});

test('it stops the server and removes the data directory once the test finishes', async () => {
  const ctx = await startTestAPI();

  onTestFinished(() => {
    expect(existsSync(ctx.dataDir)).toBeFalse();
    expect(fetch(`${ctx.url}/rpc/sessions/list`)).rejects.toThrow();
  });
});
