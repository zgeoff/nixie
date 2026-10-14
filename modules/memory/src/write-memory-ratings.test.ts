import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { MemoryRatingError } from './memory-rating-error';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it rates the newest version a recall with history delivered', async () => {
  const ctx = await setupTest();
  const tram = await createMemoryItem(ctx.memory.store, { text: 'Takes the tram to work' });

  await ctx.memory.store.retire({ target: tram, provenance: buildMockProvenance() });
  await ctx.memory.store.recall({
    itemIDs: [tram.itemID],
    includeRetired: true,
    includeHistory: true,
    thread: 'conversation',
  });

  await ctx.memory.store.rate({
    thread: 'conversation',
    runID: 'run-1',
    ratedBy: null,
    ratings: [{ item: tram.itemID, verdict: 'noise' }],
  });
  const [rated] = await readRecords(ctx.memory.log, { afterSequence: 0, kinds: ['memory.rated'] });

  expect(rated?.record.payload['ratings']).toStrictEqual([
    { itemID: tram.itemID, version: 2, verdict: 'noise' },
  ]);
});

test('it refuses a note on an item forgotten since the recall', async () => {
  const ctx = await setupTest();
  const tram = await createMemoryItem(ctx.memory.store, { text: 'Takes the tram to work' });

  await ctx.memory.store.recall({ itemIDs: [tram.itemID], thread: 'conversation' });
  await ctx.memory.store.forget({ target: tram, provenance: buildMockProvenance() });

  const rate = ctx.memory.store.rate({
    thread: 'conversation',
    runID: 'run-1',
    ratedBy: null,
    ratings: [{ item: tram.itemID, verdict: 'misleading', note: 'it was out of date' }],
  });

  await rate.catch(() => {});

  expect(rate).rejects.toThrowWithMessage(
    MemoryRatingError,
    `${tram.itemID} was forgotten, so a note on it can't be kept.`,
  );
});
