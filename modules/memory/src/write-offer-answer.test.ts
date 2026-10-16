import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildMockWriteCaller, startTestMemory, writeModelReplyRecord } from './test-utils';
import { readMemoryRows } from './test-utils/read-memory-rows';
import { removeMessageKey } from './test-utils/remove-message-key';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';
import type { MemoryTables } from './types';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test('it applies the offered text on a typed yes to the reply that ends with the offer line', async () => {
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

  await writeModelReplyRecord(ctx.memory.log, {
    thread: 'conversation',
    text: `That cargo box looks roomy.\n${line}`,
  });

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Yes please!',
    spans: [{ start: 0, end: 11, source: 'typed' }],
  });

  const outcome = await ctx.memory.store.writes.answerOffer({
    image: { messageSequence: photo, image: 1 },
    answerSequence: answer,
    caller: buildMockWriteCaller({ model: 'claude-opus-5-5' }),
  });

  invariant(outcome.status === 'applied');

  const recalled = await ctx.memory.store.recall({ itemIDs: [outcome.itemID] });

  expect(recalled.items).toMatchObject([
    {
      text: 'The owner rides a green cargo bike',
      evidenceQuote:
        'Yes please! — confirming the offer to save: The owner rides a green cargo bike',
      origin: 'conversation',
      source: 'owner',
      model: 'claude-opus-5-5',
    },
  ]);
});

test('it records in the version that your typed yes confirmed the offer, and where the yes lies', async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Look what I planted',
    spans: [{ start: 0, end: 19, source: 'typed' }],
    images: ['image/png'],
  });

  const line = await ctx.memory.store.writes.offerImage({
    image: { messageSequence: photo, image: 1 },
    text: 'The owner grows tomatoes on the balcony',
    caller: buildMockWriteCaller(),
  });

  await writeModelReplyRecord(ctx.memory.log, { thread: 'conversation', text: line });

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'yes',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  const outcome = await ctx.memory.store.writes.answerOffer({
    image: { messageSequence: photo, image: 1 },
    answerSequence: answer,
    caller: buildMockWriteCaller(),
  });

  invariant(outcome.status === 'applied');

  const [offer] = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.image_offered'],
  });

  const row = await ctx.db
    .selectFrom('memory_versions')
    .select(['evidence', 'checks'])
    .where('item_id', '=', outcome.itemID)
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({
    evidence: JSON.stringify({ recordSequence: answer, start: 0, end: 3 }),
    checks: JSON.stringify({
      quote: 'pass',
      offer: { sequence: offer?.record.sequence, answer: 'typed_yes' },
    }),
  });
});

test('it declines a typed no and leaves memory unchanged', async () => {
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

  await writeModelReplyRecord(ctx.memory.log, { thread: 'conversation', text: line });

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'no thanks',
    spans: [{ start: 0, end: 9, source: 'typed' }],
  });

  const outcome = await ctx.memory.store.writes.answerOffer({
    image: { messageSequence: photo, image: 1 },
    answerSequence: answer,
    caller: buildMockWriteCaller(),
  });

  const after = await readMemoryRows(ctx.db);

  expect(outcome).toStrictEqual({ status: 'declined' });
  expect(after).toStrictEqual({ items: [], versions: [] });
});

test('it leaves no proposal for a typed no', async () => {
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

  await writeModelReplyRecord(ctx.memory.log, { thread: 'conversation', text: line });

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'no thanks',
    spans: [{ start: 0, end: 9, source: 'typed' }],
  });

  await ctx.memory.store.writes.answerOffer({
    image: { messageSequence: photo, image: 1 },
    answerSequence: answer,
    caller: buildMockWriteCaller(),
  });

  const pending = await ctx.memory.store.proposals.listPending();

  expect(pending).toStrictEqual([]);
});

test('it declines a yes that adds anything more, because the offered text would not match it', async () => {
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

  await writeModelReplyRecord(ctx.memory.log, { thread: 'conversation', text: line });

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'yes, but it is blue',
    spans: [{ start: 0, end: 19, source: 'typed' }],
  });

  const outcome = await ctx.memory.store.writes.answerOffer({
    image: { messageSequence: photo, image: 1 },
    answerSequence: answer,
    caller: buildMockWriteCaller(),
  });

  const rows = await readMemoryRows(ctx.db);

  expect(outcome).toStrictEqual({ status: 'declined' });
  expect(rows).toStrictEqual({ items: [], versions: [] });
});

test('it declines a yes that you pasted rather than typed', async () => {
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

  await writeModelReplyRecord(ctx.memory.log, { thread: 'conversation', text: line });

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'yes',
    spans: [{ start: 0, end: 3, source: 'pasted' }],
  });

  const outcome = await ctx.memory.store.writes.answerOffer({
    image: { messageSequence: photo, image: 1 },
    answerSequence: answer,
    caller: buildMockWriteCaller(),
  });

  const rows = await readMemoryRows(ctx.db);

  expect(outcome).toStrictEqual({ status: 'declined' });
  expect(rows).toStrictEqual({ items: [], versions: [] });
});

test('it declines once the message that holds the image is forgotten', async () => {
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

  await writeModelReplyRecord(ctx.memory.log, { thread: 'conversation', text: line });

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'yes',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  await removeMessageKey(ctx.memory.log, photo);

  const outcome = await ctx.memory.store.writes.answerOffer({
    image: { messageSequence: photo, image: 1 },
    answerSequence: answer,
    caller: buildMockWriteCaller(),
  });

  const rows = await readMemoryRows(ctx.db);

  expect(outcome).toStrictEqual({ status: 'declined' });
  expect(rows).toStrictEqual({ items: [], versions: [] });
});

test('it declines once a forget of the image message has started, before its key is gone', async () => {
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

  await writeModelReplyRecord(ctx.memory.log, { thread: 'conversation', text: line });

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'yes',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  // the API commits this record before it removes the message's key
  await writeRecords(ctx.memory.log, [
    {
      kind: 'record.forget_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { recordSequence: photo },
    },
  ]);

  const outcome = await ctx.memory.store.writes.answerOffer({
    image: { messageSequence: photo, image: 1 },
    answerSequence: answer,
    caller: buildMockWriteCaller(),
  });

  const rows = await readMemoryRows(ctx.db);

  expect(outcome).toStrictEqual({ status: 'declined' });
  expect(rows).toStrictEqual({ items: [], versions: [] });
});

test('it declines a yes to a reply that showed other text than the offer holds', async () => {
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

  await writeModelReplyRecord(ctx.memory.log, {
    thread: 'conversation',
    text: "Want me to remember this? Here's what I'd save: The owner rides a red road bike",
  });

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'yes',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  const outcome = await ctx.memory.store.writes.answerOffer({
    image: { messageSequence: photo, image: 1 },
    answerSequence: answer,
    caller: buildMockWriteCaller(),
  });

  const rows = await readMemoryRows(ctx.db);

  expect(outcome).toStrictEqual({ status: 'declined' });
  expect(rows).toStrictEqual({ items: [], versions: [] });
});

test('it declines a yes to a later reply, though an earlier reply presented the offer', async () => {
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

  await writeModelReplyRecord(ctx.memory.log, { thread: 'conversation', text: line });

  await writeModelReplyRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Shall I book the 8:15 ferry for Saturday too?',
  });

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'yes',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  const outcome = await ctx.memory.store.writes.answerOffer({
    image: { messageSequence: photo, image: 1 },
    answerSequence: answer,
    caller: buildMockWriteCaller(),
  });

  const rows = await readMemoryRows(ctx.db);

  expect(outcome).toStrictEqual({ status: 'declined' });
  expect(rows).toStrictEqual({ items: [], versions: [] });
});

test('it declines a yes to a reply that asks something after the offer line', async () => {
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

  await writeModelReplyRecord(ctx.memory.log, {
    thread: 'conversation',
    text: `${line}\nShall I book the 8:15 ferry for Saturday too?`,
  });

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'yes',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  const outcome = await ctx.memory.store.writes.answerOffer({
    image: { messageSequence: photo, image: 1 },
    answerSequence: answer,
    caller: buildMockWriteCaller(),
  });

  const rows = await readMemoryRows(ctx.db);

  expect(outcome).toStrictEqual({ status: 'declined' });
  expect(rows).toStrictEqual({ items: [], versions: [] });
});

test('it declines a yes when no reply presented the offer', async () => {
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

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'yes',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  const outcome = await ctx.memory.store.writes.answerOffer({
    image: { messageSequence: photo, image: 1 },
    answerSequence: answer,
    caller: buildMockWriteCaller(),
  });

  const rows = await readMemoryRows(ctx.db);

  expect(outcome).toStrictEqual({ status: 'declined' });
  expect(rows).toStrictEqual({ items: [], versions: [] });
});

test('it declines once a forget of the reply that presented the offer has started', async () => {
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

  const reply = await writeModelReplyRecord(ctx.memory.log, { thread: 'conversation', text: line });

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'yes',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  // the API commits this record before it removes the reply's key
  await writeRecords(ctx.memory.log, [
    {
      kind: 'record.forget_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { recordSequence: reply },
    },
  ]);

  const outcome = await ctx.memory.store.writes.answerOffer({
    image: { messageSequence: photo, image: 1 },
    answerSequence: answer,
    caller: buildMockWriteCaller(),
  });

  const rows = await readMemoryRows(ctx.db);

  expect(outcome).toStrictEqual({ status: 'declined' });
  expect(rows).toStrictEqual({ items: [], versions: [] });
});

test('it refuses a yes that is not your first message after the offer', async () => {
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

  await writeModelReplyRecord(ctx.memory.log, { thread: 'conversation', text: line });

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'What time is it in Lisbon?',
    spans: [{ start: 0, end: 26, source: 'typed' }],
  });

  const later = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'yes',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  const answering = ctx.memory.store.writes.answerOffer({
    image: { messageSequence: photo, image: 1 },
    answerSequence: later,
    caller: buildMockWriteCaller(),
  });

  await answering.catch(() => {});

  expect(answering).rejects.toThrowWithMessage(
    Error,
    `#${String(later)} is not the owner's answer to the offer: only their first message after it answers it, so nothing was saved.`,
  );
});

test('it refuses an answer for an image the model made no offer for', async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Here is my new bike',
    spans: [{ start: 0, end: 19, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'yes',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  const answering = ctx.memory.store.writes.answerOffer({
    image: { messageSequence: photo, image: 1 },
    answerSequence: answer,
    caller: buildMockWriteCaller(),
  });

  await answering.catch(() => {});

  expect(answering).rejects.toThrowWithMessage(
    Error,
    `You made no offer for image 1 of #${String(photo)}, so nothing was saved.`,
  );
});

test('it saves one offer once, however often the yes is passed on', async () => {
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

  await writeModelReplyRecord(ctx.memory.log, { thread: 'conversation', text: line });

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'yes',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  await ctx.memory.store.writes.answerOffer({
    image: { messageSequence: photo, image: 1 },
    answerSequence: answer,
    caller: buildMockWriteCaller(),
  });

  const again = await ctx.memory.store.writes.answerOffer({
    image: { messageSequence: photo, image: 1 },
    answerSequence: answer,
    caller: buildMockWriteCaller(),
  });

  const rows = await readMemoryRows(ctx.db);

  expect(again).toStrictEqual({ status: 'declined' });
  expect(rows.versions).toHaveLength(1);
});

test('it saves one offer once when 2 answers race', async () => {
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

  await writeModelReplyRecord(ctx.memory.log, { thread: 'conversation', text: line });

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'yes',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  await Promise.allSettled([
    ctx.memory.store.writes.answerOffer({
      image: { messageSequence: photo, image: 1 },
      answerSequence: answer,
      caller: buildMockWriteCaller(),
    }),
    ctx.memory.store.writes.answerOffer({
      image: { messageSequence: photo, image: 1 },
      answerSequence: answer,
      caller: buildMockWriteCaller(),
    }),
  ]);

  const rows = await readMemoryRows(ctx.db);

  expect(rows.versions).toHaveLength(1);
});
