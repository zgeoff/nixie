import { expect, test } from 'bun:test';
import { findRecordKeys } from '@heynixie/log';
import { buildMockWriteCaller } from './build-mock-write-caller';
import { createAnsweredOffer } from './create-answered-offer';
import { startTestMemory } from './start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it writes an offer and a typed yes that saves the offered text', async () => {
  const ctx = await setupTest();
  const offer = await createAnsweredOffer(ctx.memory, { text: 'The owner keeps a tortoise' });

  const outcome = await ctx.memory.store.writes.answerOffer({
    image: offer.image,
    answerSequence: offer.answerSequence,
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toStrictEqual({ status: 'applied', itemID: expect.toBeString(), version: 1 });
});

test('it returns the key the offer record is sealed under', async () => {
  const ctx = await setupTest();
  const offer = await createAnsweredOffer(ctx.memory, { text: 'The owner keeps a tortoise' });
  const keys = await findRecordKeys(ctx.memory.log, [offer.offerKeyID]);

  expect(keys.get(offer.offerKeyID)).toBeInstanceOf(CryptoKey);
});
