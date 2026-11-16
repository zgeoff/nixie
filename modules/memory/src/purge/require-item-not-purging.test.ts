import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { makeGatedCall } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { readCurrentItemKey } from '../item-key/read-current-item-key';
import { buildMockCheckerAnswer } from '../test-utils/build-mock-checker-answer';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { buildMockWriteCaller } from '../test-utils/build-mock-write-caller';
import { seedBegunPurge } from '../test-utils/seed-begun-purge';
import { startTestMemory } from '../test-utils/start-test-memory';
import { writeOwnerMessageRecord } from '../test-utils/write-owner-message-record';
import { requireSealingKeyCurrent } from './require-sealing-key-current';

async function setupTest(verdict: 'asserted' | 'unsure' = 'asserted') {
  const checker = makeGatedCall(() => buildMockCheckerAnswer({ verdict }));

  const memory = await startTestMemory({ gate: { check: checker.call } });

  checker.release();

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  return {
    memory,
    checker,
    sequence,
    beginForget: () => seedBegunPurge(memory.log, { recordSequence: sequence, itemIDs: [] }),
  };
}

test('it refuses a proposal for an item whose purge is unfinished, and writes no proposal', async () => {
  const ctx = await setupTest('unsure');

  const item = await ctx.memory.store.remember({
    text: 'Drinks tea',
    provenance: buildMockProvenance(),
  });

  await seedBegunPurge(ctx.memory.log, { recordSequence: ctx.sequence, itemIDs: [item.itemID] });

  const write = ctx.memory.store.writes.remember({
    text: 'Drinks green tea',
    target: item,
    caller: buildMockWriteCaller(),
  });

  const error = await write.catch((error_: unknown) => error_);

  expect(error).toMatchObject({ code: 'ITEM_PURGING' });

  const pending = await ctx.memory.store.proposals.listPending();

  expect(pending).toStrictEqual([]);
});

test('it refuses a proposal sealed before a purge closed the item key, and writes no proposal', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Drinks tea',
    evidence: { recordSequence: ctx.sequence, start: 0, end: 22 },
    evidenceQuote: 'I take my coffee black',
    provenance: buildMockProvenance(),
  });

  const sealedUnder = await readCurrentItemKey(ctx.memory.log, item.itemID);

  invariant(sealedUnder.status === 'readable');

  await seedBegunPurge(ctx.memory.log, {
    recordSequence: ctx.sequence,
    itemIDs: [item.itemID],
  });

  await ctx.memory.store.purgeItemEvidence({ recordSequence: ctx.sequence, itemID: item.itemID });

  const write = withWriteTransaction(ctx.memory.log.writer, (tx) =>
    requireSealingKeyCurrent(tx, ctx.memory.log, {
      itemID: item.itemID,
      keyID: sealedUnder.keyID,
    }),
  );

  const error = await write.catch((error_: unknown) => error_);

  expect(error).toMatchObject({ code: 'ITEM_PURGING' });
});
