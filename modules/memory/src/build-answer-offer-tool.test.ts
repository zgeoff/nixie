import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildAnswerOfferTool } from './build-answer-offer-tool';
import { buildMockWriteCaller, readItemShortID, startTestMemory } from './test-utils';
import { buildMockToolContext } from './test-utils/build-mock-tool-context';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';
import type { MemoryTables } from './types';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, tool: buildAnswerOfferTool(memory.store) };
}

test('it returns the saved item by its short ID on your typed yes', async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Our new puppy',
    spans: [{ start: 0, end: 13, source: 'typed' }],
    images: ['image/webp'],
  });

  await ctx.memory.store.writes.offerImage({
    image: { messageSequence: photo, image: 1 },
    text: 'The owner has a beagle puppy',
    caller: buildMockWriteCaller(),
  });

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'yep',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  const outcome = await ctx.tool.run(
    {
      callID: 'call-1',
      tool: 'memory.answer_offer',
      input: { eventID: `#${String(photo)}`, image: 1, answerEventID: `#${String(answer)}` },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  const item = await ctx.memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('item_id')
    .executeTakeFirst();

  invariant(item);

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      status: 'applied',
      itemID: await readItemShortID(ctx.memory.log, item.item_id),
      version: 1,
    },
  });
});

test('it returns declined for a no', async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Our new puppy',
    spans: [{ start: 0, end: 13, source: 'typed' }],
    images: ['image/webp'],
  });

  await ctx.memory.store.writes.offerImage({
    image: { messageSequence: photo, image: 1 },
    text: 'The owner has a beagle puppy',
    caller: buildMockWriteCaller(),
  });

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'nah',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  const outcome = await ctx.tool.run(
    {
      callID: 'call-1',
      tool: 'memory.answer_offer',
      input: { eventID: String(photo), image: 1, answerEventID: String(answer) },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({ status: 'ok', result: { status: 'declined' } });
});

test('it returns an answer to no offer as a refusal the model reads', async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Our new puppy',
    spans: [{ start: 0, end: 13, source: 'typed' }],
    images: ['image/webp'],
  });

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'yes',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  const outcome = await ctx.tool.run(
    {
      callID: 'call-1',
      tool: 'memory.answer_offer',
      input: { eventID: String(photo), image: 1, answerEventID: String(answer) },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: `You made no offer for image 1 of #${String(photo)}, so nothing was saved.`,
  });
});
