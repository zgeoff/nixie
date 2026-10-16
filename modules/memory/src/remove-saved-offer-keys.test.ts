import { expect, test } from 'bun:test';
import { findRecordKeys, readRecords } from '@heynixie/log';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { buildMockWriteCaller } from './test-utils/build-mock-write-caller';
import { createAnsweredOffer } from './test-utils/create-answered-offer';
import { startFaultPointFailure } from './test-utils/start-fault-point-failure';
import { startNextTestMemory } from './test-utils/start-next-test-memory';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it removes at start the key of an offer whose save committed before a crash', async () => {
  const ctx = await setupTest();

  const offer = await createAnsweredOffer(ctx.memory, {
    text: 'The owner paddles an orange sea kayak',
  });

  startFaultPointFailure('memory.offer.saved');

  const crash = await ctx.memory.store.writes
    .answerOffer({
      image: offer.image,
      answerSequence: offer.answerSequence,
      caller: buildMockWriteCaller(),
    })
    .catch((error: unknown) => error);

  const leftByCrash = await findRecordKeys(ctx.memory.log, [offer.offerKeyID]);
  const restarted = await startNextTestMemory(ctx.memory);
  const leftAfterStart = await findRecordKeys(restarted.log, [offer.offerKeyID]);

  expect(crash).toMatchObject({ message: 'crashed at memory.offer.saved' });
  expect(leftByCrash.has(offer.offerKeyID)).toBe(true);
  expect(leftAfterStart.has(offer.offerKeyID)).toBe(false);
});

test('it leaves no readable offered text once you forget an item whose save a crash cut short', async () => {
  const ctx = await setupTest();

  const offer = await createAnsweredOffer(ctx.memory, {
    text: 'The owner paddles an orange sea kayak',
  });

  startFaultPointFailure('memory.offer.saved');

  await ctx.memory.store.writes
    .answerOffer({
      image: offer.image,
      answerSequence: offer.answerSequence,
      caller: buildMockWriteCaller(),
    })
    .catch(() => {});

  const restarted = await startNextTestMemory(ctx.memory);

  const item = await restarted.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'version'])
    .executeTakeFirstOrThrow();

  await restarted.store.forget({
    target: { itemID: item.item_id, version: item.version },
    provenance: buildMockProvenance(),
  });

  const records = await readRecords(restarted.log, { afterSequence: 0, limit: 1000 });

  // the reply that presented the offer is your conversation, which a forget of that reply removes
  expect(
    records
      .filter((entry) => JSON.stringify(entry.record.erasable).includes('orange sea kayak'))
      .map((entry) => entry.record.kind),
  ).toStrictEqual(['model.reply']);
});

test('it never removes at start the key of an offer that no answer saved', async () => {
  const ctx = await setupTest();

  const offer = await createAnsweredOffer(ctx.memory, {
    text: 'The owner paddles an orange sea kayak',
  });

  const restarted = await startNextTestMemory(ctx.memory);
  const keys = await findRecordKeys(restarted.log, [offer.offerKeyID]);

  expect(keys.has(offer.offerKeyID)).toBe(true);
});
