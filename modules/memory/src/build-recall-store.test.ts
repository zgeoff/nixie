import { expect, mock, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildStubEncoder } from './test-utils/build-stub-encoder';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory({
    semanticSearch: {
      encoder: buildStubEncoder([['boiler', 'heating', 'furnace']]),
      onError: mock<(error: unknown) => void>(),
    },
  });

  await memory.store.waitForSemanticIndex();

  return { memory };
}

test('#recall returns no moment text to per-turn retrieval when a moment matches the query by meaning', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'booked it for the ninth' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Boiler service booked',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'reflection', text: 'Furnace upkeep mattered more than cost.' },
  });

  await ctx.memory.store.moments.readMatches({
    query: 'heating engineer visit',
    from: null,
    to: null,
    includeRetired: false,
    before: null,
    limit: 10,
  });

  const result = await ctx.memory.store.recall({
    query: 'heating engineer visit',
    limit: 5,
    selfNoteLimit: 2,
    minSimilarity: 0.38,
    excludePinned: true,
    excludeSensitive: true,
    thread: 'conversation',
  });

  expect(result).toStrictEqual({ items: [], next: null, searchMode: 'hybrid' });
});

test('#recallMessages returns no moment text to per-turn retrieval when a moment matches the query by meaning', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'booked it for the ninth' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Boiler service booked',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'reflection', text: 'Furnace upkeep mattered more than cost.' },
  });

  await ctx.memory.store.moments.readMatches({
    query: 'heating engineer visit',
    from: null,
    to: null,
    includeRetired: false,
    before: null,
    limit: 10,
  });

  const result = await ctx.memory.store.recallMessages({
    query: 'heating engineer visit',
    limit: 3,
    minScore: 0.25,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  });

  expect(result).toStrictEqual({ messages: [], searchMode: 'hybrid' });
});
