import { expect, test } from 'bun:test';
import { readHeldRecordKeys } from './read-held-record-keys';
import { createAnsweredOffer } from './test-utils/create-answered-offer';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it finds the held keys among more IDs than one statement can bind', async () => {
  const ctx = await setupTest();
  const offer = await createAnsweredOffer(ctx.memory, { text: 'The owner bakes rye bread' });

  const held = await readHeldRecordKeys(ctx.memory.log, [
    ...Array.from({ length: 70_000 }, () => crypto.randomUUID()),
    offer.offerKeyID,
  ]);

  expect(held).toStrictEqual([offer.offerKeyID]);
});

test('it finds no keys for no IDs', async () => {
  const ctx = await setupTest();
  const held = await readHeldRecordKeys(ctx.memory.log, []);

  expect(held).toStrictEqual([]);
});
