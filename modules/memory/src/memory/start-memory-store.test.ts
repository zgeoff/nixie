import { expect, mock, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { buildStubEncoder } from '../test-utils/build-stub-encoder';
import { createMemoryItem } from '../test-utils/create-memory-item';
import { startNextTestMemory } from '../test-utils/start-next-test-memory';
import { startTestMemory } from '../test-utils/start-test-memory';
import { memoryRatedCodec } from './memory-rated-codec';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it rebuilds the index from the active items at start', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const restarted = await startNextTestMemory(ctx.memory);
  const result = await restarted.store.recall({ query: 'flowerpot' });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([item.itemID]);
});

test('it leaves retired items out of the index it builds at start', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const restarted = await startNextTestMemory(ctx.memory);
  const result = await restarted.store.recall({ query: 'Elm', includeRetired: true });

  expect(result.items).toStrictEqual([]);
});

test('it starts on a log with no memory', async () => {
  const ctx = await setupTest();
  const result = await ctx.memory.store.recall({});

  expect(result).toStrictEqual({
    items: [],
    next: null,
    omitted: { items: [], count: 0, versions: 0 },
  });
});

test('it rebuilds the vector index from the active items after it starts', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Ana is my sister' });

  const restarted = await startNextTestMemory(ctx.memory, {
    semanticSearch: {
      encoder: buildStubEncoder([['sister', 'sibling']]),
      onError: mock<(error: unknown) => void>(),
    },
  });

  const isReady = await restarted.store.waitForSemanticIndex();
  const result = await restarted.store.recall({ query: 'who is my sibling' });

  expect(isReady).toBeTrue();
  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([item.itemID]);
});

test('it reports the semantic index as never ready with no encoder', async () => {
  const ctx = await setupTest();

  expect(ctx.memory.store.waitForSemanticIndex()).resolves.toBeFalse();
});

test('it reports a failed rebuild and keeps search on keywords', async () => {
  const ctx = await setupTest();

  await createMemoryItem(ctx.memory.store, { text: 'Ana is my sister' });

  const failure = new Error('the model file is unreadable');

  const onError = mock<(error: unknown) => void>();

  const restarted = await startNextTestMemory(ctx.memory, {
    semanticSearch: { encoder: { encode: () => Promise.reject(failure) }, onError },
  });

  const isReady = await restarted.store.waitForSemanticIndex();
  const result = await restarted.store.recall({ query: 'my sister' });

  expect(isReady).toBeFalse();
  expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
  expect(result.searchMode).toBe('keyword-fallback');
});

test('it starts on a log that holds a memory.rated record and still places a trigger item', async () => {
  const turn = { trigger: { items: 3, minScore: 0, minSimilarity: 1 } };
  const ctx = { memory: await startTestMemory({ turn }) };

  const piano = await ctx.memory.store.remember({
    text: 'Piano is tuned in spring',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
    labels: { gist: 'Piano tuning', topic: 'general', triggers: ['piano tuning'] },
  });

  await writeRecords(ctx.memory.log, [
    {
      kind: memoryRatedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: memoryRatedCodec.encode({
        ratingID: 'rating-1',
        recalledSequence: 1,
        runID: 'run-1',
        ratings: [{ itemID: piano.itemID, version: piano.version, verdict: 'helpful' }],
      }),
    },
  ]);

  const restarted = await startNextTestMemory(ctx.memory, { turn });

  const result = await restarted.store.readTurnMemory({
    text: 'piano tuning',
    thread: 'conversation',
    excludedWords: [],
    held: { readVersions: () => Promise.resolve([]), readWriteStart: () => Promise.resolve(null) },
  });

  expect(result).toMatchObject({
    kind: 'placed',
    items: [{ itemID: piano.itemID }],
    selfNotes: [],
  });
});
