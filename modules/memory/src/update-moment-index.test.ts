import { expect, mock, onTestFinished, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { makeGatedCall } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { makeDeliveryLock } from './make-delivery-lock';
import type { MomentTables } from './moment-types';
import type { MomentIndexes } from './start-store-indexes';
import { startVectorIndex } from './start-vector-index';
import { buildStubEncoder } from './test-utils/build-stub-encoder';
import { startTestMemory } from './test-utils/start-test-memory';
import { updateMomentIndex } from './update-moment-index';

async function setupTest() {
  const memory = await startTestMemory();

  const encoding = makeGatedCall(
    buildStubEncoder([
      ['boiler', 'heating'],
      ['canal', 'river'],
    ]).encode,
  );

  const vectors = startVectorIndex({ encode: encoding.call }, mock<(error: unknown) => void>());

  onTestFinished(() => vectors.stop());

  await vectors.rebuild([]);

  const moments: MomentIndexes = { vectors, cursor: { through: 0 }, lock: makeDeliveryLock() };

  return {
    memory,
    vectors,
    encoding,
    updateIndex: () => updateMomentIndex(memory.log, moments),
  };
}

test('it waits for an encoding queued before the update, so the next search reads its vector', async () => {
  const ctx = await setupTest();

  const events: string[] = [];

  ctx.vectors.update({ itemID: 'moment-queued', text: 'Boiler service booked' });

  await ctx.encoding.started;

  const updated = (async () => {
    await ctx.updateIndex();

    events.push('updated');
  })();

  const encoded = (async () => {
    await ctx.vectors.waitForIdle();

    events.push('encoded');
  })();

  const moments = ctx.memory.log.writer.db.$extendTables<MomentTables>();

  // The SQLite worker answers in order, so the second read returns after the update's own read.
  await moments.selectFrom('moments').select('moment_id').execute();
  await moments.selectFrom('moments').select('moment_id').execute();

  ctx.encoding.release();

  await Promise.all([updated, encoded]);

  expect(events).toStrictEqual(['encoded', 'updated']);
});

test('it holds a vector for a moment kept since the last update, ready for the next search', async () => {
  const ctx = await setupTest();

  ctx.encoding.release();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'booked it for the ninth' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Boiler service booked',
  });

  invariant(kept.status === 'written');

  await ctx.updateIndex();

  expect(
    ctx.vectors.readMatches('heating engineer visit', { limit: 5, minSimilarity: 0.3 }),
  ).resolves.toStrictEqual([{ itemID: kept.momentID, similarity: expect.toBeWithin(0.99, 1.02) }]);
});

test('it drops the vector of a moment whose destroy started since the last update', async () => {
  const ctx = await setupTest();

  ctx.encoding.release();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'booked it for the ninth' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Boiler service booked',
  });

  invariant(kept.status === 'written');

  await ctx.updateIndex();
  await ctx.memory.store.moments.destroy({ momentID: kept.momentID, version: 1 });
  await ctx.updateIndex();

  expect(
    ctx.vectors.readMatches('heating engineer visit', { limit: 5, minSimilarity: 0 }),
  ).resolves.toStrictEqual([]);
});

test('it replaces the vector of a moment whose title changed since the last update', async () => {
  const ctx = await setupTest();

  ctx.encoding.release();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'booked it for the ninth' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Boiler service booked',
  });

  invariant(kept.status === 'written');

  await ctx.updateIndex();

  await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'title', title: 'Walk along the canal' },
  });

  await ctx.updateIndex();

  expect(
    ctx.vectors.readMatches('heating engineer visit', { limit: 5, minSimilarity: 0.3 }),
  ).resolves.toStrictEqual([]);
});
