import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildHostMemory } from './build-host-memory';
import { buildMockWriteCaller } from './test-utils/build-mock-write-caller';
import { createConsolidationDiff } from './test-utils/create-consolidation-diff';
import { createMemoryItem } from './test-utils/create-memory-item';
import { createProposal } from './test-utils/create-proposal';
import { readApprovalRecords } from './test-utils/read-approval-records';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, host: buildHostMemory(memory.store) };
}

test('it writes the same records for an approval as the store’s own approval as the host', async () => {
  const ctx = await setupTest();

  const throughStore = await createProposal(ctx.memory.store, {
    text: 'Likes jazz',
    caller: buildMockWriteCaller({ model: 'claude-test-1' }),
  });

  const throughHost = await createProposal(ctx.memory.store, {
    text: 'Likes tea',
    caller: buildMockWriteCaller({ model: 'claude-test-1' }),
  });

  await ctx.memory.store.proposals.approve({
    proposalID: throughStore.proposalID,
    actionHash: throughStore.actionHash,
    identityID: 'host',
  });

  await ctx.host.approveProposal({
    proposalID: throughHost.proposalID,
    actionHash: throughHost.actionHash,
  });

  const [storeRecords, hostRecords] = await Promise.all([
    readApprovalRecords(ctx.memory.log, throughStore),
    readApprovalRecords(ctx.memory.log, throughHost),
  ]);

  expect(storeRecords.map((record) => record['kind'])).toStrictEqual([
    'memory.approval_recorded',
    'memory.version_added',
  ]);

  expect(hostRecords).toStrictEqual(storeRecords);
});

test('it approves a proposal with your edited text, as your own version', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory.store, { text: 'Likes jaz' });

  const result = await ctx.host.approveProposal({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    editedText: 'Likes jazz',
  });

  const history = await ctx.memory.store.readHistory(proposal.itemID);

  expect(result).toStrictEqual({ status: 'applied', itemID: proposal.itemID, version: 1 });

  expect(history?.versions).toMatchObject([
    { version: 1, change: 'created', origin: 'owner', source: 'owner', text: 'Likes jazz' },
  ]);
});

test('it keeps the reason a rejection gives with its record, and closes the proposal', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory.store, { text: 'Prefers tabs.' });

  await ctx.host.rejectProposal({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    reason: "wrong, it's spaces",
  });

  const [records, pending] = await Promise.all([
    readRecords(ctx.memory.log, { afterSequence: 0, kinds: ['memory.proposal_rejected'] }),
    ctx.memory.store.proposals.listPending(),
  ]);

  expect(records.map((entry) => entry.record.erasable)).toStrictEqual([
    { status: 'readable', fields: { reason: "wrong, it's spaces" } },
  ]);

  expect(pending).toStrictEqual([]);
});

test('it edits an item as a new version of yours, and keeps the old one in its history', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Likes jaz', origin: 'task' });
  const ref = await ctx.host.edit(item, 'Likes jazz');
  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(ref).toStrictEqual({ itemID: item.itemID, version: 2 });

  expect(history?.versions).toMatchObject([
    { version: 1, change: 'created', origin: 'task', text: 'Likes jaz' },
    { version: 2, change: 'edited', origin: 'owner', source: 'owner', text: 'Likes jazz' },
  ]);
});

test('it retires an item as your own change', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Lives in Lisbon' });
  const ref = await ctx.host.retire(item);
  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(ref).toStrictEqual({ itemID: item.itemID, version: 2 });

  expect(history).toMatchObject({
    state: 'retired',
    versions: [
      { version: 1, change: 'created', state: 'active' },
      { version: 2, change: 'retired', state: 'retired', origin: 'owner', source: 'owner' },
    ],
  });
});

test('it restores a retired item as your own change', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Lives in Lisbon' });

  const retired = await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const ref = await ctx.host.restore(retired);
  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(ref).toStrictEqual({ itemID: item.itemID, version: 3 });

  expect(history).toMatchObject({
    state: 'active',
    versions: [
      { version: 1 },
      { version: 2, change: 'retired' },
      { version: 3, change: 'restored', state: 'active', origin: 'owner', source: 'owner' },
    ],
  });
});

test('it pins an item into the pinned core', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Is allergic to peanuts' });

  await ctx.host.pin(item.itemID, true);

  const core = await ctx.memory.store.readPinnedCore();

  expect(core.map((entry) => entry.itemID)).toStrictEqual([item.itemID]);
});

test('it forgets an item for good as your own change', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'The gate code is 4417' });

  await ctx.host.forget(item);

  const history = await ctx.memory.store.readHistory(item.itemID);
  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });

  expect(history).toMatchObject({ state: 'forgotten', versions: [{ status: 'shredded' }] });

  expect(records.map((entry) => entry.record.kind)).toStrictEqual([
    'memory.version_added',
    'memory.forget_started',
    'memory.forgotten',
  ]);
});

test('it approves each named change as the host and leaves the rest pending', async () => {
  const ctx = await setupTest();

  const [stale, trip] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment' }),
    createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' }),
  ]);

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      { kind: 'retire', inputs: [stale], reason: 'The date has passed.', source: 'owner' },
      { kind: 'retire', inputs: [trip], reason: 'The trip has ended.', source: 'owner' },
    ],
  });

  const [first, second] = diff.changes;

  invariant(first && second);

  const outcomes = await ctx.host.approveChanges([
    { changeID: first.changeID, actionHash: first.actionHash },
  ]);

  const [records, pending] = await Promise.all([
    readApprovalRecords(ctx.memory.log, {
      proposalID: first.changeID,
      itemID: stale.itemID,
      actionHash: first.actionHash,
    }),
    ctx.memory.store.consolidations.readPending(),
  ]);

  expect(outcomes).toStrictEqual([
    { changeID: first.changeID, status: 'applied', versions: [{ ...stale, version: 2 }] },
  ]);

  expect(records[0]).toMatchObject({
    kind: 'memory.consolidation_approved',
    payload: { identityID: 'host' },
  });

  expect(pending?.changes.map((change) => change.changeID)).toStrictEqual([second.changeID]);
});

test('it rejects a change as the host, which leaves the diff', async () => {
  const ctx = await setupTest();
  const stale = await createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment' });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [stale], reason: 'The date has passed.', source: 'owner' }],
  });

  const [change] = diff.changes;

  invariant(change);

  await ctx.host.rejectChange({ changeID: change.changeID, actionHash: change.actionHash });

  const [records, pending] = await Promise.all([
    readRecords(ctx.memory.log, { afterSequence: 0, kinds: ['memory.consolidation_rejected'] }),
    ctx.memory.store.consolidations.readPending(),
  ]);

  expect(records.map((entry) => entry.record.payload)).toStrictEqual([
    { changeID: change.changeID, identityID: 'host' },
  ]);

  expect(pending).toBeNull();
});
