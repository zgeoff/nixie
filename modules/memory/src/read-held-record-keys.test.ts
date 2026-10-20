import { expect, test } from 'bun:test';
import { readHeldRecordKeys } from './read-held-record-keys';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeImageOfferRecord } from './test-utils/write-image-offer-record';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it finds the held keys among more IDs than one statement can bind', async () => {
  const ctx = await setupTest();

  const offer = await writeImageOfferRecord(ctx.memory.log, {
    thread: 'conversation',
    messageSequence: 1,
    image: 1,
    text: 'The owner bakes rye bread',
  });

  const held = await readHeldRecordKeys(ctx.memory.log, [
    ...Array.from({ length: 70_000 }, () => crypto.randomUUID()),
    offer.keyID,
  ]);

  expect(held).toStrictEqual([offer.keyID]);
});

test('it finds no keys for no IDs', async () => {
  const ctx = await setupTest();
  const held = await readHeldRecordKeys(ctx.memory.log, []);

  expect(held).toStrictEqual([]);
});
