import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { createConsolidationDiff } from './test-utils/create-consolidation-diff';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it closes the change it rejects with your rejection, and changes nothing in memory', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees' });
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'Stale.', source: 'owner' }],
  });
  const [change] = diff.changes;

  invariant(change);

  await ctx.memory.store.consolidations.reject({
    changeID: change.changeID,
    actionHash: change.actionHash,
    identityID: 'host',
  });

  const history = await ctx.memory.store.readHistory(item.itemID);
  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });

  expect(history?.state).toBe('active');
  expect(records.at(-1)?.record).toMatchObject({
    kind: 'memory.consolidation_rejected',
    thread: 'memory-consolidator',
    payload: { changeID: change.changeID, identityID: 'host' },
  });
});

test('it keeps the other changes of the diff pending when it rejects one', async () => {
  const ctx = await setupTest();
  const bees = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees' });
  const trip = await createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon' });
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      { kind: 'retire', inputs: [bees], reason: 'Stale.', source: 'owner' },
      { kind: 'retire', inputs: [trip], reason: 'The trip has ended.', source: 'owner' },
    ],
  });
  const [rejected, kept] = diff.changes;

  invariant(rejected && kept);

  await ctx.memory.store.consolidations.reject({
    changeID: rejected.changeID,
    actionHash: rejected.actionHash,
    identityID: 'host',
  });

  const pending = await ctx.memory.store.consolidations.readPending();

  expect(pending?.changes.map((change) => change.changeID)).toStrictEqual([kept.changeID]);
});

test('it refuses a rejection that names another action hash', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees' });
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'Stale.', source: 'owner' }],
  });
  const [change] = diff.changes;

  invariant(change);

  const rejection = ctx.memory.store.consolidations.reject({
    changeID: change.changeID,
    actionHash: 'sha256:another',
    identityID: 'host',
  });

  await rejection.catch(() => {});

  expect(rejection).rejects.toMatchObject({ code: 'PROPOSAL_HASH' });
});
