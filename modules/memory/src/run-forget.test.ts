import { expect, mock, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildStubEncoder } from './test-utils/build-stub-encoder';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startTestMemory } from './test-utils/start-test-memory';
import type { CleanupSessions } from './types';

async function setupTest() {
  const cleanupSessions = mock<CleanupSessions>(() => Promise.resolve());

  return { memory: await startTestMemory({ cleanupSessions }), cleanupSessions };
}

test('it deletes the item key and leaves no copy of it in the key store files', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const stored = await ctx.memory.writer.keys
    .$extendTables<{ record_keys: { key_id: string; wrapped: Uint8Array } }>()
    .selectFrom('record_keys')
    .select('wrapped')
    .where('key_id', '=', item.itemID)
    .executeTakeFirst();

  invariant(stored);

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const remaining = await ctx.memory.writer.keys
    .$extendTables<{ record_keys: { key_id: string } }>()
    .selectFrom('record_keys')
    .select('key_id')
    .where('key_id', '=', item.itemID)
    .execute();

  const [keysFile, keysLog] = await Promise.all([
    readFile(join(ctx.memory.dataDir, 'keys.db')),
    readFile(join(ctx.memory.dataDir, 'keys.db-wal')),
  ]);

  expect(remaining).toStrictEqual([]);
  expect(keysFile.includes(stored.wrapped)).toBeFalse();
  expect(keysLog.byteLength).toBe(0);
});

test('it reads every version of a forgotten item as a gap', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const edited = await ctx.memory.store.remember({
    text: 'Lives on Oak Avenue',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.forget({
    target: edited,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(history).toStrictEqual({
    itemID: item.itemID,
    state: 'forgotten',
    subject: 'owner',
    versions: [
      {
        version: 1,
        change: 'created',
        state: 'active',
        origin: 'owner',
        source: 'owner',
        recordedAt: expect.toBeNumber(),
        status: 'shredded',
      },
      {
        version: 2,
        change: 'edited',
        state: 'active',
        origin: 'owner',
        source: 'owner',
        recordedAt: expect.toBeNumber(),
        status: 'shredded',
      },
    ],
  });
});

test('it stops recall from returning the forgotten item by query or by ID', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const byQuery = await ctx.memory.store.recall({ query: 'flowerpot' });
  const byID = await ctx.memory.store.recall({ itemIDs: [item.itemID], includeRetired: true });

  expect(byQuery.items).toStrictEqual([]);
  expect(byID.items).toStrictEqual([]);
});

test('it runs the session cleanup and then records the forget as complete', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });

  expect(ctx.cleanupSessions).toHaveBeenCalledExactlyOnceWith({ itemID: item.itemID });

  expect(records.map((entry) => entry.record)).toMatchObject([
    { kind: 'memory.version_added', payload: { itemID: item.itemID, version: 1 } },
    { kind: 'memory.forget_started', payload: { itemID: item.itemID, version: 1 } },
    { kind: 'memory.forgotten', payload: { itemID: item.itemID } },
  ]);
});

test('it rejects a forget bound to a version the item has moved past', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Lives on Oak Avenue',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const forget = ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await forget.catch(() => {});

  expect(forget).rejects.toMatchObject({ code: 'STALE_VERSION' });
});

test('it rejects a second forget of a forgotten item', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const forget = ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await forget.catch(() => {});

  expect(forget).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('it drops the forgotten item from the vector index, so the next match takes its place', async () => {
  const memory = await startTestMemory({
    semanticSearch: {
      encoder: buildStubEncoder([['sister', 'sibling']]),
      onError: mock<(error: unknown) => void>(),
    },
  });

  const forgotten = await createMemoryItem(memory.store, { text: 'Ana is my sibling' });
  const kept = await createMemoryItem(memory.store, { text: 'Ana is my only sibling' });

  await memory.store.waitForSemanticIndex();

  await memory.store.forget({
    target: forgotten,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const result = await memory.store.recall({ query: 'my sister', limit: 1 });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([kept.itemID]);
});

test('it commits the caller’s own write with the forget’s start, and its refusal destroys nothing', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const refused = await ctx.memory.store
    .forget({
      target: item,
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
      writeInTransaction: () => Promise.reject(new Error('the action is settled')),
    })
    .catch((error: unknown) => error);

  const detail = await ctx.memory.store.view.readItem(item.itemID);
  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });

  expect(refused).toMatchObject({ message: 'the action is settled' });
  expect(ctx.cleanupSessions).not.toHaveBeenCalled();
  expect(detail).toMatchObject({ state: 'active', status: 'readable' });
  expect(records.map((entry) => entry.record.kind)).toStrictEqual(['memory.version_added']);
});
