import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildMockWriteCaller, startTestMemory } from './test-utils';
import { readMemoryRows } from './test-utils/read-memory-rows';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';
import type { MemoryTables } from './types';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test('it returns the one line that offers the text', async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Here is my new bike',
    spans: [{ start: 0, end: 19, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const line = await ctx.memory.store.writes.offerImage({
    image: { messageSequence: photo, image: 1 },
    text: 'The owner rides a green cargo bike',
    caller: buildMockWriteCaller(),
  });

  expect(line).toBe(
    "Want me to remember this? Here's what I'd save: The owner rides a green cargo bike",
  );
});

test('it records the offer with its text sealed and the image named in the plain payload', async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Here is my new bike',
    spans: [{ start: 0, end: 19, source: 'typed' }],
    images: ['image/jpeg'],
  });

  await ctx.memory.store.writes.offerImage({
    image: { messageSequence: photo, image: 1 },
    text: 'The owner rides a green cargo bike',
    caller: buildMockWriteCaller({ runID: 'run-7' }),
  });

  const offers = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.image_offered'],
  });

  expect(offers.map((entry) => entry.record)).toMatchObject([
    {
      thread: 'conversation',
      payload: { messageSequence: photo, image: 1, runID: 'run-7' },
      erasable: { status: 'readable', fields: { text: 'The owner rides a green cargo bike' } },
    },
  ]);
});

test('it saves nothing to memory and proposes nothing until you answer', async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Here is my new bike',
    spans: [{ start: 0, end: 19, source: 'typed' }],
    images: ['image/jpeg'],
  });

  await ctx.memory.store.writes.offerImage({
    image: { messageSequence: photo, image: 1 },
    text: 'The owner rides a green cargo bike',
    caller: buildMockWriteCaller(),
  });

  const rows = await readMemoryRows(ctx.db);
  const pending = await ctx.memory.store.proposals.listPending();

  expect(rows).toStrictEqual({ items: [], versions: [] });
  expect(pending).toStrictEqual([]);
});

test('it refuses a second offer for the same image and keeps one offer record', async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Here is my new bike',
    spans: [{ start: 0, end: 19, source: 'typed' }],
    images: ['image/jpeg'],
  });

  await ctx.memory.store.writes.offerImage({
    image: { messageSequence: photo, image: 1 },
    text: 'The owner rides a green cargo bike',
    caller: buildMockWriteCaller(),
  });

  const second = ctx.memory.store.writes.offerImage({
    image: { messageSequence: photo, image: 1 },
    text: 'The owner has a cargo bike',
    caller: buildMockWriteCaller(),
  });

  await second.catch(() => {});

  expect(second).rejects.toThrowWithMessage(
    Error,
    `You already offered to remember image 1 of #${String(photo)}, so no offer was made. Offer once per image.`,
  );

  const offers = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.image_offered'],
  });

  expect(offers).toHaveLength(1);
});

test('it records one offer when 2 offers for one image race', async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Here is my new bike',
    spans: [{ start: 0, end: 19, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const results = await Promise.allSettled([
    ctx.memory.store.writes.offerImage({
      image: { messageSequence: photo, image: 1 },
      text: 'The owner rides a green cargo bike',
      caller: buildMockWriteCaller(),
    }),
    ctx.memory.store.writes.offerImage({
      image: { messageSequence: photo, image: 1 },
      text: 'The owner has a cargo bike',
      caller: buildMockWriteCaller(),
    }),
  ]);

  expect(results.map((result) => result.status).toSorted()).toStrictEqual([
    'fulfilled',
    'rejected',
  ]);
});

test('it offers each image of one message once', async () => {
  const ctx = await setupTest();

  const photos = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Two shots from the hike',
    spans: [{ start: 0, end: 23, source: 'typed' }],
    images: ['image/jpeg', 'image/jpeg'],
  });

  await ctx.memory.store.writes.offerImage({
    image: { messageSequence: photos, image: 1 },
    text: 'The owner hiked the coastal track in spring',
    caller: buildMockWriteCaller(),
  });

  const line = await ctx.memory.store.writes.offerImage({
    image: { messageSequence: photos, image: 2 },
    text: 'The owner camped at the lighthouse',
    caller: buildMockWriteCaller(),
  });

  expect(line).toBe(
    "Want me to remember this? Here's what I'd save: The owner camped at the lighthouse",
  );
});

test('it refuses an image number that the message does not carry', async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Here is my new bike',
    spans: [{ start: 0, end: 19, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const offering = ctx.memory.store.writes.offerImage({
    image: { messageSequence: photo, image: 2 },
    text: 'The owner rides a green cargo bike',
    caller: buildMockWriteCaller(),
  });

  await offering.catch(() => {});

  expect(offering).rejects.toThrowWithMessage(
    Error,
    `#${String(photo)} holds no image 2 of the owner's, so no offer was made.`,
  );
});

test('it refuses a message that carries no image', async () => {
  const ctx = await setupTest();

  const message = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'I ride a green cargo bike',
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  const offering = ctx.memory.store.writes.offerImage({
    image: { messageSequence: message, image: 1 },
    text: 'The owner rides a green cargo bike',
    caller: buildMockWriteCaller(),
  });

  await offering.catch(() => {});

  expect(offering).rejects.toMatchObject({ code: 'OFFER_REFUSED' });
});

test("it refuses an image from another thread's message", async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'task-garden',
    text: 'Here is my new bike',
    spans: [{ start: 0, end: 19, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const offering = ctx.memory.store.writes.offerImage({
    image: { messageSequence: photo, image: 1 },
    text: 'The owner rides a green cargo bike',
    caller: buildMockWriteCaller(),
  });

  await offering.catch(() => {});

  expect(offering).rejects.toMatchObject({ code: 'OFFER_REFUSED' });
});

test('it refuses a text that holds an invisible character', async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Here is my new bike',
    spans: [{ start: 0, end: 19, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const offering = ctx.memory.store.writes.offerImage({
    image: { messageSequence: photo, image: 1 },
    text: 'The owner rides a green​ cargo bike',
    caller: buildMockWriteCaller(),
  });

  await offering.catch(() => {});

  expect(offering).rejects.toThrowWithMessage(
    Error,
    'The text holds an invisible character, so no offer was made. Offer plain text.',
  );
});
