import { expect, test } from 'bun:test';
import { buildOfferImageTool } from './build-offer-image-tool';
import { startTestMemory } from './test-utils';
import { buildMockToolContext } from './test-utils/build-mock-tool-context';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, tool: buildOfferImageTool(memory.store) };
}

test('it returns the line to say for an image of yours', async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Our new puppy',
    spans: [{ start: 0, end: 13, source: 'typed' }],
    images: ['image/webp'],
  });

  const outcome = await ctx.tool.run(
    {
      callID: 'call-1',
      tool: 'memory.offer_image',
      input: { eventID: `#${String(photo)}`, image: 1, text: 'The owner has a beagle puppy' },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      status: 'offered',
      line: "Want me to remember this? Here's what I'd save: The owner has a beagle puppy",
    },
    record: { status: 'offered' },
  });
});

test('it returns a second offer for one image as a refusal the model reads', async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Our new puppy',
    spans: [{ start: 0, end: 13, source: 'typed' }],
    images: ['image/webp'],
  });

  await ctx.tool.run(
    {
      callID: 'call-1',
      tool: 'memory.offer_image',
      input: { eventID: String(photo), image: 1, text: 'The owner has a beagle puppy' },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  const outcome = await ctx.tool.run(
    {
      callID: 'call-2',
      tool: 'memory.offer_image',
      input: { eventID: String(photo), image: 1, text: 'The owner has a puppy' },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: `You already offered to remember image 1 of #${String(photo)}, so no offer was made. Offer once per image.`,
  });
});

test("it leaves the offered text out of the call's record", async () => {
  const ctx = await setupTest();

  expect(
    ctx.tool.recordInput?.({ eventID: '#12', image: 1, text: 'The owner has a beagle puppy' }),
  ).toStrictEqual({ eventID: '#12', image: 1 });
});
