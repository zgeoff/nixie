import { expect, test } from 'bun:test';
import { findRecordKeys, readRecords } from '@heynixie/log';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { startNextTestMemory } from './test-utils/start-next-test-memory';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeImageOfferRecord } from './test-utils/write-image-offer-record';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test("it removes at start the key of a saved offer's record that a crash left behind", async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Here is a photo',
    spans: [{ start: 0, end: 15, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const offer = await writeImageOfferRecord(ctx.memory.log, {
    thread: 'conversation',
    messageSequence: photo,
    image: 1,
    text: 'The owner paddles an orange sea kayak',
  });

  await ctx.memory.store.remember({
    text: 'The owner paddles an orange sea kayak',
    provenance: buildMockProvenance({
      checks: { quote: 'pass', offer: { sequence: offer.sequence, answer: 'typed_yes' } },
    }),
  });

  const restarted = await startNextTestMemory(ctx.memory);
  const left = await findRecordKeys(restarted.log, [offer.keyID]);

  expect(left.has(offer.keyID)).toBe(false);
});

test('it leaves no readable offered text once you forget an item whose offer key a crash left behind', async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Here is a photo',
    spans: [{ start: 0, end: 15, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const offer = await writeImageOfferRecord(ctx.memory.log, {
    thread: 'conversation',
    messageSequence: photo,
    image: 1,
    text: 'The owner paddles an orange sea kayak',
  });

  const item = await ctx.memory.store.remember({
    text: 'The owner paddles an orange sea kayak',
    provenance: buildMockProvenance({
      checks: { quote: 'pass', offer: { sequence: offer.sequence, answer: 'typed_yes' } },
    }),
  });

  const restarted = await startNextTestMemory(ctx.memory);

  await restarted.store.forget({ target: item, provenance: buildMockProvenance() });

  const records = await readRecords(restarted.log, { afterSequence: 0, limit: 1000 });

  expect(
    records.filter((entry) => JSON.stringify(entry.record.erasable).includes('orange sea kayak')),
  ).toStrictEqual([]);
});

test('it never removes at start the key of an offer that no version saved', async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Here is a photo',
    spans: [{ start: 0, end: 15, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const offer = await writeImageOfferRecord(ctx.memory.log, {
    thread: 'conversation',
    messageSequence: photo,
    image: 1,
    text: 'The owner paddles an orange sea kayak',
  });

  const restarted = await startNextTestMemory(ctx.memory);
  const keys = await findRecordKeys(restarted.log, [offer.keyID]);

  expect(keys.has(offer.keyID)).toBe(true);
});
