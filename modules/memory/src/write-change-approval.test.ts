import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { createConsolidationDiff } from './test-utils/create-consolidation-diff';
import { createMemoryItem } from './test-utils/create-memory-item';
import { readApprovalRecords } from './test-utils/read-approval-records';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it writes a merged item with the least trusted source among its inputs', async () => {
  const ctx = await setupTest();
  const typed = await createMemoryItem(ctx.memory.store, { text: 'Is allergic to peanuts' });

  const fetched = await createMemoryItem(ctx.memory.store, {
    text: 'Has a peanut allergy',
    origin: 'task',
    source: 'untrusted',
  });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'merge',
        inputs: [typed, fetched],
        text: 'Is allergic to peanuts',
        reason: 'Both items state the same allergy.',
        source: 'untrusted',
      },
    ],
  });

  const [change] = diff.changes;

  invariant(change);

  await ctx.memory.store.consolidations.approve({
    changeID: change.changeID,
    actionHash: change.actionHash,
    identityID: 'device-1',
  });

  const merged = await ctx.memory.store.recall({ itemIDs: [typed.itemID, fetched.itemID] });

  expect(merged.items).toMatchObject([
    {
      itemID: typed.itemID,
      version: 2,
      change: 'edited',
      text: 'Is allergic to peanuts',
      origin: 'task',
      source: 'untrusted',
      model: 'claude-test-1',
    },
  ]);
});

test('it merges 2 pinned items into one that fits the pinned core once the other input retires', async () => {
  const ctx = await setupTest();

  const [kept, dropped] = await Promise.all(
    ['Keeps a long packing list for trips. ', 'Keeps a long reading list for winter. '].map(
      (line) =>
        ctx.memory.store.remember({
          text: line.repeat(98),
          isPinned: true,
          provenance: {
            origin: 'owner',
            source: 'owner',
            taskID: null,
            proposalID: null,
            checks: null,
          },
        }),
    ),
  );

  invariant(kept && dropped);

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'merge',
        inputs: [kept, dropped],
        text: 'Keeps long packing and reading lists. '.repeat(116),
        reason: 'Both items are lists the user keeps.',
        source: 'owner',
      },
    ],
  });

  const [change] = diff.changes;

  invariant(change);

  const versions = await ctx.memory.store.consolidations.approve({
    changeID: change.changeID,
    actionHash: change.actionHash,
    identityID: 'device-1',
  });

  expect(versions).toIncludeSameMembers([
    { itemID: kept.itemID, version: 2 },
    { itemID: dropped.itemID, version: 2 },
  ]);
});

test('it retires every input but the first when it applies a merge, each keeping its own source', async () => {
  const ctx = await setupTest();
  const kept = await createMemoryItem(ctx.memory.store, { text: 'Is allergic to peanuts' });

  const dropped = await createMemoryItem(ctx.memory.store, {
    text: 'Has a peanut allergy',
    origin: 'task',
    source: 'owner_data',
  });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'merge',
        inputs: [kept, dropped],
        text: 'Is allergic to peanuts',
        reason: 'Both items state the same allergy.',
        source: 'owner_data',
      },
    ],
  });

  const [change] = diff.changes;

  invariant(change);

  const written = await ctx.memory.store.consolidations.approve({
    changeID: change.changeID,
    actionHash: change.actionHash,
    identityID: 'device-1',
  });

  const history = await ctx.memory.store.readHistory(dropped.itemID);

  expect(written).toStrictEqual([
    { itemID: kept.itemID, version: 2 },
    { itemID: dropped.itemID, version: 2 },
  ]);

  expect(history?.versions.at(-1)).toMatchObject({
    change: 'retired',
    state: 'retired',
    origin: 'task',
    source: 'owner_data',
  });
});

test('it approves one change alone and leaves the rest of the diff pending', async () => {
  const ctx = await setupTest();

  const items = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'owner likes. tea green' }),
    createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment on 2026-03-02' }),
    createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon' }),
  ]);

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'rewrite',
        inputs: [items[0]],
        text: 'Likes green tea',
        reason: 'The wording was garbled.',
        source: 'owner',
      },
      { kind: 'retire', inputs: [items[1]], reason: 'The date has passed.', source: 'owner' },
      { kind: 'retire', inputs: [items[2]], reason: 'The trip has ended.', source: 'owner' },
    ],
  });

  const [first, approved, third] = diff.changes;

  invariant(first && approved && third);

  await ctx.memory.store.consolidations.approve({
    changeID: approved.changeID,
    actionHash: approved.actionHash,
    identityID: 'device-1',
  });

  const pending = await ctx.memory.store.consolidations.readPending();

  const histories = await Promise.all(
    items.map((item) => ctx.memory.store.readHistory(item.itemID)),
  );

  expect(pending?.changes.map((change) => change.changeID)).toStrictEqual([
    first.changeID,
    third.changeID,
  ]);

  expect(histories.map((history) => history?.state)).toStrictEqual(['active', 'retired', 'active']);
});

test('it gives a rewritten item its new text and keeps its source', async () => {
  const ctx = await setupTest();

  const item = await createMemoryItem(ctx.memory.store, {
    text: 'owner likes. tea green, no sugar',
    origin: 'memory_writer',
  });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'rewrite',
        inputs: [item],
        text: 'Likes green tea with no sugar',
        reason: 'The wording was garbled.',
        source: 'owner',
      },
    ],
  });

  const [change] = diff.changes;

  invariant(change);

  await ctx.memory.store.consolidations.approve({
    changeID: change.changeID,
    actionHash: change.actionHash,
    identityID: 'device-1',
  });

  const recalled = await ctx.memory.store.recall({ itemIDs: [item.itemID] });

  expect(recalled.items).toMatchObject([
    { version: 2, text: 'Likes green tea with no sugar', origin: 'task', source: 'owner' },
  ]);
});

test('it retires the item a retirement names and keeps its text', async () => {
  const ctx = await setupTest();

  const item = await createMemoryItem(ctx.memory.store, {
    text: 'Has a dentist appointment on 2026-03-02',
  });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'The date has passed.', source: 'owner' }],
  });

  const [change] = diff.changes;

  invariant(change);

  await ctx.memory.store.consolidations.approve({
    changeID: change.changeID,
    actionHash: change.actionHash,
    identityID: 'device-1',
  });

  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(history).toMatchObject({
    state: 'retired',
    versions: [
      { version: 1, change: 'created' },
      {
        version: 2,
        change: 'retired',
        status: 'readable',
        text: 'Has a dentist appointment on 2026-03-02',
      },
    ],
  });
});

test('it records your approval with the versions it wrote, bound to the change it approves', async () => {
  const ctx = await setupTest();

  const item = await createMemoryItem(ctx.memory.store, {
    text: 'Has a dentist appointment on 2026-03-02',
  });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'The date has passed.', source: 'owner' }],
  });

  const [change] = diff.changes;

  invariant(change);

  await ctx.memory.store.consolidations.approve({
    changeID: change.changeID,
    actionHash: change.actionHash,
    identityID: 'device-1',
  });

  const records = await readApprovalRecords(ctx.memory.log, {
    proposalID: change.changeID,
    itemID: item.itemID,
    actionHash: change.actionHash,
  });

  expect(records).toMatchObject([
    {
      kind: 'memory.consolidation_approved',
      thread: 'memory-consolidator',
      payload: {
        changeID: '<proposal>',
        approvalID: '<approval>',
        actionHash: '<action-hash>',
        identityID: 'device-1',
      },
    },
    {
      kind: 'memory.version_added',
      thread: 'memory-consolidator',
      payload: { itemID: '<item>', version: 2, change: 'retired', proposalID: '<proposal>' },
    },
  ]);
});

test('it refuses a second approval of a change it consumed', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon' });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'The trip has ended.', source: 'owner' }],
  });

  const [change] = diff.changes;

  invariant(change);

  const answer = {
    changeID: change.changeID,
    actionHash: change.actionHash,
    identityID: 'device-1',
  };

  await ctx.memory.store.consolidations.approve(answer);

  const again = ctx.memory.store.consolidations.approve(answer);

  await again.catch(() => {});

  expect(again).rejects.toMatchObject({ code: 'PROPOSAL_CLOSED' });
});

test('it refuses an answer that names another action hash, and applies nothing', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon' });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'The trip has ended.', source: 'owner' }],
  });

  const [change] = diff.changes;

  invariant(change);

  const approval = ctx.memory.store.consolidations.approve({
    changeID: change.changeID,
    actionHash: 'sha256:another',
    identityID: 'device-1',
  });

  await approval.catch(() => {});

  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(approval).rejects.toMatchObject({ code: 'PROPOSAL_HASH' });
  expect(history?.state).toBe('active');
});

test('it refuses an answer to a change that does not exist', async () => {
  const ctx = await setupTest();

  const approval = ctx.memory.store.consolidations.approve({
    changeID: 'change-404',
    actionHash: 'sha256:another',
    identityID: 'device-1',
  });

  await approval.catch(() => {});

  expect(approval).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('it fails a merge as stale when one input moved on', async () => {
  const ctx = await setupTest();

  const [kept, moved] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Is allergic to peanuts' }),
    createMemoryItem(ctx.memory.store, { text: 'Has a peanut allergy' }),
  ]);

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'merge',
        inputs: [kept, moved],
        text: 'Is allergic to peanuts',
        reason: 'Both items state the same allergy.',
        source: 'owner',
      },
    ],
  });

  const [change] = diff.changes;

  invariant(change);

  await ctx.memory.store.retire({
    target: moved,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const approval = ctx.memory.store.consolidations.approve({
    changeID: change.changeID,
    actionHash: change.actionHash,
    identityID: 'device-1',
  });

  await approval.catch(() => {});

  expect(approval).rejects.toMatchObject({ code: 'STALE_VERSION' });
});

test('it leaves the first input of a stale merge as it was', async () => {
  const ctx = await setupTest();

  const [kept, moved] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Is allergic to peanuts' }),
    createMemoryItem(ctx.memory.store, { text: 'Has a peanut allergy' }),
  ]);

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'merge',
        inputs: [kept, moved],
        text: 'Is allergic to peanuts, and carries an injector',
        reason: 'Both items state the same allergy.',
        source: 'owner',
      },
    ],
  });

  const [change] = diff.changes;

  invariant(change);

  await ctx.memory.store.retire({
    target: moved,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.consolidations
    .approve({ changeID: change.changeID, actionHash: change.actionHash, identityID: 'device-1' })
    .catch(() => {});

  const history = await ctx.memory.store.readHistory(kept.itemID);

  expect(history?.versions).toMatchObject([{ version: 1, text: 'Is allergic to peanuts' }]);
});

test('it refuses a change whose first input was forgotten', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'owner likes. tea green' });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'rewrite',
        inputs: [item],
        text: 'Likes green tea',
        reason: 'The wording was garbled.',
        source: 'owner',
      },
    ],
  });

  const [change] = diff.changes;

  invariant(change);

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const approval = ctx.memory.store.consolidations.approve({
    changeID: change.changeID,
    actionHash: change.actionHash,
    identityID: 'device-1',
  });

  await approval.catch(() => {});

  expect(approval).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
