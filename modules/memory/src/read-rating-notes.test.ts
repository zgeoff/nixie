import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readRatingNotes } from './read-rating-notes';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it reads each named note in the order named, and a rating with no note as missing', async () => {
  const ctx = await setupTest();
  const tram = await createMemoryItem(ctx.memory.store, { text: 'Takes the tram to work' });
  const jam = await createMemoryItem(ctx.memory.store, { text: 'Makes plum jam each autumn' });

  await ctx.memory.store.recall({ itemIDs: [tram.itemID, jam.itemID], thread: 'conversation' });

  await ctx.memory.store.rate({
    thread: 'conversation',
    runID: 'run-1',
    ratedBy: null,
    ratings: [
      { item: tram.itemID, verdict: 'misleading', note: 'the tram stopped running in May' },
      { item: jam.itemID, verdict: 'noise' },
    ],
  });

  const [rated] = await readRecords(ctx.memory.log, { afterSequence: 0, kinds: ['memory.rated'] });

  invariant(rated);

  const notes = await readRatingNotes(ctx.memory.log, [
    { sequence: rated.record.sequence, itemID: jam.itemID },
    { sequence: rated.record.sequence, itemID: tram.itemID },
  ]);

  expect(notes).toStrictEqual([
    { sequence: rated.record.sequence, itemID: jam.itemID, status: 'missing' },
    {
      sequence: rated.record.sequence,
      itemID: tram.itemID,
      status: 'readable',
      text: 'the tram stopped running in May',
    },
  ]);
});

test('it reads the note of a forgotten item as shredded', async () => {
  const ctx = await setupTest();
  const tram = await createMemoryItem(ctx.memory.store, { text: 'Takes the tram to work' });

  await ctx.memory.store.recall({ itemIDs: [tram.itemID], thread: 'conversation' });

  await ctx.memory.store.rate({
    thread: 'conversation',
    runID: 'run-1',
    ratedBy: null,
    ratings: [{ item: tram.itemID, verdict: 'helpful', note: 'the tram matters here' }],
  });

  const [rated] = await readRecords(ctx.memory.log, { afterSequence: 0, kinds: ['memory.rated'] });

  invariant(rated);

  await ctx.memory.store.forget({ target: tram, provenance: buildMockProvenance() });

  const notes = await readRatingNotes(ctx.memory.log, [
    { sequence: rated.record.sequence, itemID: tram.itemID },
  ]);

  expect(notes).toStrictEqual([
    { sequence: rated.record.sequence, itemID: tram.itemID, status: 'shredded' },
  ]);
});

test('it reads a sequence that holds no rating as missing', async () => {
  const ctx = await setupTest();
  const tram = await createMemoryItem(ctx.memory.store, { text: 'Takes the tram to work' });

  await ctx.memory.store.recall({ itemIDs: [tram.itemID], thread: 'conversation' });

  const [recalled] = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.recalled'],
  });

  invariant(recalled);

  const notes = await readRatingNotes(ctx.memory.log, [
    { sequence: recalled.record.sequence, itemID: tram.itemID },
  ]);

  expect(notes).toStrictEqual([
    { sequence: recalled.record.sequence, itemID: tram.itemID, status: 'missing' },
  ]);
});
