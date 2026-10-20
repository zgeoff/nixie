import { expect, test } from 'bun:test';
import { readRecordKeys, readRecords } from '@heynixie/log';
import { startTestMemory } from './start-test-memory';
import { writeImageOfferRecord } from './write-image-offer-record';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it writes an image offer with the image in the payload and the text under its own key', async () => {
  const ctx = await setupTest();

  const offer = await writeImageOfferRecord(ctx.memory.log, {
    thread: 'conversation',
    messageSequence: 3,
    image: 2,
    text: 'Keeps a lemon tree on the balcony',
  });

  const [entry] = await readRecords(ctx.memory.log, {
    afterSequence: offer.sequence - 1,
    limit: 1,
  });

  const keys = await readRecordKeys(ctx.memory.log, [offer.keyID]);

  expect(entry?.record).toMatchObject({
    sequence: offer.sequence,
    kind: 'memory.image_offered',
    thread: 'conversation',
    payload: { messageSequence: 3, image: 2, runID: 'run-offer' },
    erasable: { status: 'readable', fields: { text: 'Keeps a lemon tree on the balcony' } },
  });

  expect(keys.has(offer.keyID)).toBe(true);
});
