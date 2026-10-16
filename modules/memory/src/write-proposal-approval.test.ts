import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { findItemKey } from './find-item-key';
import { buildMockWriteCaller } from './test-utils/build-mock-write-caller';
import { createProposal } from './test-utils/create-proposal';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';
import type { MemoryTables } from './types';

test('it applies an approved proposal as proposed, keeping its outside source', async () => {
  const memory = await startTestMemory();
  const pending = await createProposal(memory.store, { text: 'Likes jazz' });

  const ref = await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  const [history, remaining] = await Promise.all([
    memory.store.readHistory(pending.itemID),
    memory.store.proposals.listPending(),
  ]);

  expect(ref).toStrictEqual({ status: 'applied', itemID: pending.itemID, version: 1 });

  expect(history?.versions).toMatchObject([
    { text: 'Likes jazz', origin: 'conversation', source: 'untrusted' },
  ]);

  expect(remaining).toStrictEqual([]);
});

test('it recalls an approved proposal with your approval and its stored source unchanged', async () => {
  const memory = await startTestMemory();
  const pending = await createProposal(memory.store, { text: 'Likes jazz' });

  await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  const result = await memory.store.recall({ itemIDs: [pending.itemID] });

  expect(result.items).toMatchObject([
    { text: 'Likes jazz', source: 'untrusted', approval: { isQuotePasted: false } },
  ]);
});

test('it recalls an approved proposal whose quote sat in a quoted block as approved from a pasted page', async () => {
  const memory = await startTestMemory();

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'have a look:\n> Robin plays the oboe on Tuesdays',
    spans: [{ start: 0, end: 47, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'Plays the oboe on Tuesdays',
    quote: 'plays the oboe on Tuesdays',
    caller: buildMockWriteCaller(),
  });

  invariant(outcome.status === 'proposed');

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  const result = await memory.store.recall({ itemIDs: [pending.itemID] });

  expect(result.items).toMatchObject([{ source: 'untrusted', approval: { isQuotePasted: true } }]);
});

test('it recalls a version that applied at once with no approval', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Likes jazz',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const result = await memory.store.recall({ itemIDs: [item.itemID] });

  expect(result.items).toMatchObject([{ source: 'owner', approval: null }]);
});

test("it fails as stale when the proposal's item moved on", async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pending = await createProposal(memory.store, { text: 'Lives on Oak Avenue', target: item });

  await memory.store.remember({
    text: 'Lives on Pine Road',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const approval = memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  await approval.catch(() => {});

  const [history, remaining] = await Promise.all([
    memory.store.readHistory(item.itemID),
    memory.store.proposals.listPending(),
  ]);

  expect(approval).rejects.toMatchObject({ code: 'STALE_VERSION' });
  expect(history?.versions.map((version) => version.version)).toStrictEqual([1, 2]);
  expect(remaining).toHaveLength(1);
});

test('it applies your edited text with the approval record', async () => {
  const memory = await startTestMemory();
  const pending = await createProposal(memory.store, { text: 'Likes jazz' });

  await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
    editedText: 'Likes bebop jazz',
  });

  const [history, records, row] = await Promise.all([
    memory.store.readHistory(pending.itemID),
    readRecords(memory.log, { afterSequence: 0 }),
    memory.writer.db
      .$extendTables<MemoryTables>()
      .selectFrom('memory_versions')
      .select(['proposal_id', 'model'])
      .where('item_id', '=', pending.itemID)
      .executeTakeFirstOrThrow(),
  ]);

  const [approval, version] = ['memory.approval_recorded', 'memory.version_added'].map((kind) =>
    records.find((entry) => entry.record.kind === kind),
  );

  invariant(version?.record.approval);

  expect(history?.versions).toMatchObject([
    { text: 'Likes bebop jazz', origin: 'owner', source: 'owner' },
  ]);

  expect(approval?.record.payload).toStrictEqual({
    proposalID: pending.proposalID,
    approvalID: version.record.approval.approvalID,
    actionHash: pending.actionHash,
    answer: 'edited',
    identityID: 'identity-1',
  });

  expect(version.record.approval).toStrictEqual({
    proposalID: pending.proposalID,
    approvalID: expect.toBeString(),
    actionHash: pending.actionHash,
  });

  expect(row).toStrictEqual({ proposal_id: pending.proposalID, model: null });
});

test('it refuses an answer that names another action hash', async () => {
  const memory = await startTestMemory();

  await memory.store.writes.remember({
    text: 'Likes jazz',
    caller: {
      origin: 'conversation',
      thread: 'conversation',
      taskID: 'conversation',
      runID: 'conversation',
      model: 'claude-opus-5-5',
    },
  });

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  const approval = memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: 'sha256:another',
    identityID: 'identity-1',
  });

  await approval.catch(() => {});

  expect(approval).rejects.toMatchObject({ code: 'PROPOSAL_HASH' });
});

test('it refuses a second approval of one proposal', async () => {
  const memory = await startTestMemory();

  await memory.store.writes.remember({
    text: 'Likes jazz',
    caller: {
      origin: 'conversation',
      thread: 'conversation',
      taskID: 'conversation',
      runID: 'conversation',
      model: 'claude-opus-5-5',
    },
  });

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  const answer = {
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  };

  await memory.store.proposals.approve(answer);

  const again = memory.store.proposals.approve(answer);

  await again.catch(() => {});

  expect(again).rejects.toMatchObject({ code: 'PROPOSAL_CLOSED' });
});

test("it refuses an approval after the proposal's lapse time", async () => {
  const clock = buildTestClock(1_000_000);

  const memory = await startTestMemory({
    gate: {
      clock,
      limits: { evidenceWindow: 20, proposalLapseMs: 5000, proposalCap: 10, closeMatchScore: 0.6 },
    },
  });

  await memory.store.writes.remember({
    text: 'Likes jazz',
    caller: {
      origin: 'conversation',
      thread: 'conversation',
      taskID: 'conversation',
      runID: 'conversation',
      model: 'claude-opus-5-5',
    },
  });

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  clock.advance(5000);

  const approval = memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  await approval.catch(() => {});

  expect(approval).rejects.toMatchObject({ code: 'PROPOSAL_CLOSED' });
});

test('it refuses an unknown proposal', async () => {
  const memory = await startTestMemory();

  const approval = memory.store.proposals.approve({
    proposalID: 'proposal-missing',
    actionHash: 'sha256:any',
    identityID: 'identity-1',
  });

  await approval.catch(() => {});

  expect(approval).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('it refuses edited text for a retirement proposal', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.writes.retire({
    target: item,
    caller: {
      origin: 'conversation',
      thread: 'conversation',
      taskID: 'conversation',
      runID: 'conversation',
      model: 'claude-opus-5-5',
    },
  });

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  const approval = memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
    editedText: 'Lives on Oak Avenue',
  });

  await approval.catch(() => {});

  expect(approval).rejects.toMatchObject({ code: 'RETIREMENT_EDIT' });
});

test('it retires an item when you approve a retirement proposal', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.writes.retire({
    target: item,
    caller: {
      origin: 'conversation',
      thread: 'conversation',
      taskID: 'conversation',
      runID: 'conversation',
      model: 'claude-opus-5-5',
    },
  });

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  const ref = await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  const history = await memory.store.readHistory(item.itemID);

  expect(ref).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 2 });
  expect(history).toMatchObject({ state: 'retired' });
});

test('it holds an approval whose text an active item closely matches, and reports that item', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'The owner is allergic to peanuts.',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pending = await createProposal(memory.store, { text: 'Owner is allergic to peanuts' });

  const result = await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  const [remaining, history] = await Promise.all([
    memory.store.proposals.listPending(),
    memory.store.readHistory(pending.itemID),
  ]);

  expect(result).toStrictEqual({
    status: 'close_match',
    item: { itemID: item.itemID, version: 1, text: 'The owner is allergic to peanuts.' },
  });

  expect(remaining.map((proposal) => proposal.proposalID)).toStrictEqual([pending.proposalID]);
  expect(history).toBeNull();
});

test('it applies a held proposal as a revision of the close match, and drops the key its new item would have used', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'The owner is allergic to peanuts.',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pending = await createProposal(memory.store, { text: 'Owner is allergic to peanuts' });

  const result = await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
    revisionOf: { itemID: item.itemID, version: 1 },
  });

  const [history, remaining, key] = await Promise.all([
    memory.store.readHistory(item.itemID),
    memory.store.proposals.listPending(),
    findItemKey(memory.log, pending.itemID),
  ]);

  expect(result).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 2 });

  expect(history?.versions.at(-1)).toMatchObject({
    text: 'Owner is allergic to peanuts',
    change: 'edited',
    origin: 'conversation',
  });

  expect(remaining).toStrictEqual([]);
  expect(key).toBeUndefined();
});

test('it applies a held proposal as a new item when your answer ignores the close match', async () => {
  const memory = await startTestMemory();

  await memory.store.remember({
    text: 'The owner is allergic to peanuts.',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pending = await createProposal(memory.store, { text: 'Owner is allergic to peanuts' });

  const result = await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
    ignoreCloseMatch: true,
  });

  expect(result).toStrictEqual({ status: 'applied', itemID: pending.itemID, version: 1 });
});

test('it applies a proposal that shares its subject but not its fact with an active item', async () => {
  const memory = await startTestMemory();

  await memory.store.remember({
    text: 'The owner is allergic to shellfish.',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pending = await createProposal(memory.store, { text: 'The owner is allergic to peanuts.' });

  const result = await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  expect(result).toStrictEqual({ status: 'applied', itemID: pending.itemID, version: 1 });
});

test('it refuses to apply an edit proposal as a revision of another item', async () => {
  const memory = await startTestMemory();

  const [item, other] = await Promise.all(
    ['Lives on Elm Street', 'Works at the library'].map((text) =>
      memory.store.remember({
        text,
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

  invariant(item && other);

  const pending = await createProposal(memory.store, {
    text: 'Lives on Oak Avenue',
    target: item,
  });

  const approval = memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
    revisionOf: other,
  });

  await approval.catch(() => {});

  expect(approval).rejects.toMatchObject({ code: 'REVISION_TARGET' });
});

test('it applies one of 2 reworded proposals approved at once, and holds the other for the item the first created', async () => {
  const memory = await startTestMemory();
  const first = await createProposal(memory.store, { text: 'Owner swims every Tuesday' });
  const second = await createProposal(memory.store, { text: 'The owner swims each Tuesday.' });

  const results = await Promise.all(
    [first, second].map((pending) =>
      memory.store.proposals.approve({
        proposalID: pending.proposalID,
        actionHash: pending.actionHash,
        identityID: 'identity-1',
      }),
    ),
  );

  const active = await memory.store.recall({ limit: 10 });

  const [item] = active.items;

  invariant(item);

  expect(active.items).toHaveLength(1);

  expect(results.toSorted((a, b) => a.status.localeCompare(b.status))).toStrictEqual([
    { status: 'applied', itemID: item.itemID, version: 1 },
    { status: 'close_match', item: { itemID: item.itemID, version: 1, text: item.text } },
  ]);
});

test("it applies nothing and leaves the proposal pending when the caller's own write refuses the approval", async () => {
  const memory = await startTestMemory();
  const pending = await createProposal(memory.store, { text: 'Keeps bees' });

  const approved = memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
    writeInTransaction: () => Promise.reject(new Error('the caller refused')),
  });

  await approved.catch(() => {});

  const [history, remaining] = await Promise.all([
    memory.store.readHistory(pending.itemID),
    memory.store.proposals.listPending(),
  ]);

  expect(approved).rejects.toThrow('the caller refused');
  expect(history).toBeNull();
  expect(remaining).toMatchObject([{ proposalID: pending.proposalID }]);
});
