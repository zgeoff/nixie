import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildEventRegistry, readEventsNote } from '@heynixie/sessions';
import invariant from 'tiny-invariant';
import { buildMemoryChangeKind } from './build-memory-change-kind';
import { MemoryRatingError } from './memory-rating-error';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { createMemoryItem } from './test-utils/create-memory-item';
import { readItemShortID } from './test-utils/read-item-short-id';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it refuses an item rated once by its short ID and once by its item ID', async () => {
  const ctx = await setupTest();
  const tram = await createMemoryItem(ctx.memory.store, { text: 'Takes the tram to work' });

  await ctx.memory.store.recall({ itemIDs: [tram.itemID], thread: 'conversation' });

  const shortID = await readItemShortID(ctx.memory.log, tram.itemID);

  const rate = ctx.memory.store.rate({
    thread: 'conversation',
    runID: 'run-1',
    ratedBy: null,
    ratings: [
      { item: shortID, verdict: 'helpful' },
      { item: tram.itemID, verdict: 'noise' },
    ],
  });

  await rate.catch(() => {});

  expect(rate).rejects.toThrowWithMessage(
    MemoryRatingError,
    `${shortID} is rated twice; rate each item once.`,
  );
});

test("it rates each item the turn's recall gave when a note about outside changes recalled after it", async () => {
  const ctx = await setupTest();

  const [tram, choir] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Takes the tram to work', origin: 'conversation' }),
    createMemoryItem(ctx.memory.store, {
      text: 'Sings in a choir on Thursdays',
      origin: 'conversation',
    }),
  ]);

  await ctx.memory.store.recall({ itemIDs: [tram.itemID, choir.itemID], thread: 'conversation' });

  await createMemoryItem(ctx.memory.store, { text: 'Grows tomatoes on the balcony' });

  const note = await readEventsNote(
    buildEventRegistry([buildMemoryChangeKind(ctx.memory.log, ctx.memory.store)]),
    { after: 0, through: 100 },
    { ownerName: null, timeZone: 'UTC' },
  );

  await ctx.memory.store.rate({
    thread: 'conversation',
    runID: 'run-1',
    ratedBy: null,
    ratings: [
      { item: tram.itemID, verdict: 'helpful' },
      { item: choir.itemID, verdict: 'noise' },
    ],
  });

  const [turnRecall, , rated] = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.recalled', 'memory.rated'],
  });

  invariant(turnRecall);

  expect(note).toInclude('Grows tomatoes on the balcony');

  expect(rated?.record.payload).toStrictEqual({
    ratingID: expect.toBeString(),
    recalledSequence: turnRecall.record.sequence,
    runID: 'run-1',
    ratings: [
      { itemID: tram.itemID, version: 1, verdict: 'helpful' },
      { itemID: choir.itemID, version: 1, verdict: 'noise' },
    ],
  });
});

test("it refuses an item that only a note about outside changes gave, not the turn's recall", async () => {
  const ctx = await setupTest();

  const tram = await createMemoryItem(ctx.memory.store, {
    text: 'Takes the tram to work',
    origin: 'conversation',
  });

  await ctx.memory.store.recall({ itemIDs: [tram.itemID], thread: 'conversation' });

  const balcony = await createMemoryItem(ctx.memory.store, {
    text: 'Grows tomatoes on the balcony',
  });

  await readEventsNote(
    buildEventRegistry([buildMemoryChangeKind(ctx.memory.log, ctx.memory.store)]),
    { after: 0, through: 100 },
    { ownerName: null, timeZone: 'UTC' },
  );

  const shortID = await readItemShortID(ctx.memory.log, balcony.itemID);

  const rate = ctx.memory.store.rate({
    thread: 'conversation',
    runID: 'run-1',
    ratedBy: null,
    ratings: [{ item: balcony.itemID, verdict: 'helpful' }],
  });

  await rate.catch(() => {});

  expect(rate).rejects.toThrowWithMessage(
    MemoryRatingError,
    `${shortID} was not among the memories you were given on the latest turn, so it can't be rated.`,
  );
});

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

  const shortID = await readItemShortID(ctx.memory.log, tram.itemID);

  const rate = ctx.memory.store.rate({
    thread: 'conversation',
    runID: 'run-1',
    ratedBy: null,
    ratings: [{ item: tram.itemID, verdict: 'misleading', note: 'it was out of date' }],
  });

  await rate.catch(() => {});

  expect(rate).rejects.toThrowWithMessage(
    MemoryRatingError,
    `${shortID} was forgotten, so a note on it can't be kept.`,
  );
});
