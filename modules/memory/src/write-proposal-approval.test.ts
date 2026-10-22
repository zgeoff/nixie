import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { readItemKey } from './read-item-key';
import { SelfNoteError } from './self-note-error';
import { buildMockWriteCaller } from './test-utils/build-mock-write-caller';
import { createProposal } from './test-utils/create-proposal';
import { createWriterProposal } from './test-utils/create-writer-proposal';
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

test('it creates a self-note when you approve its proposal, and recall reads it as one with its model', async () => {
  const memory = await startTestMemory();

  await memory.store.writes.remember({
    text: 'Dry jokes land better with the owner than puns',
    subject: 'self',
    caller: buildMockWriteCaller({ model: 'claude-opus-5-5' }),
  });

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  const approved = await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  invariant(approved.status === 'applied');

  const recalled = await memory.store.recall({ itemIDs: [approved.itemID] });

  expect(recalled.items).toMatchObject([
    {
      text: 'Dry jokes land better with the owner than puns',
      subject: 'self',
      origin: 'conversation',
      source: 'untrusted',
      model: 'claude-opus-5-5',
    },
  ]);
});

test('it keeps the kind the release before reads as self on the rows of an approved self-note and its proposal', async () => {
  const memory = await startTestMemory();

  await memory.store.writes.remember({
    text: 'Dry jokes land better with the owner than puns',
    subject: 'self',
    caller: buildMockWriteCaller({ model: 'claude-opus-5-5' }),
  });

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  const approved = await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  invariant(approved.status === 'applied');

  const db = memory.log.writer.db.$extendTables<MemoryTables>();

  const [item, proposal] = await Promise.all([
    db
      .selectFrom('memory_items')
      .select(['kind', 'subject'])
      .where('item_id', '=', approved.itemID)
      .executeTakeFirst(),
    db
      .selectFrom('memory_proposals')
      .select(['kind', 'subject'])
      .where('proposal_id', '=', pending.proposalID)
      .executeTakeFirst(),
  ]);

  expect(item).toStrictEqual({ kind: 'self', subject: 'self' });
  expect(proposal).toStrictEqual({ kind: 'self', subject: 'self' });
});

test('it marks a self-note in records of their own, so its proposal and version records hold only the keys the release before reads', async () => {
  const memory = await startTestMemory();

  await memory.store.writes.remember({
    text: 'Dry jokes land better with the owner than puns',
    subject: 'self',
    caller: buildMockWriteCaller({ model: 'claude-opus-5-5' }),
  });

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  const approved = await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  invariant(approved.status === 'applied');

  const records = await readRecords(memory.log, {
    afterSequence: 0,
    kinds: [
      'memory.proposed',
      'memory.proposal_self_noted',
      'memory.version_added',
      'memory.self_noted',
    ],
  });

  expect(records.map((entry) => entry.record.kind)).toStrictEqual([
    'memory.proposed',
    'memory.proposal_self_noted',
    'memory.version_added',
    'memory.self_noted',
  ]);

  expect(records.map((entry) => entry.record.payload)).toSatisfyAll(
    (payload: object) => !('subject' in payload),
  );

  expect(records.map((entry) => entry.record.payload).slice(1, 4)).toMatchObject([
    { proposalID: pending.proposalID },
    { itemID: approved.itemID },
    { itemID: approved.itemID },
  ]);
});

test("it creates a shared item when you approve the note-taker's shared proposal", async () => {
  const memory = await startTestMemory();

  const pending = await createWriterProposal(memory, {
    message: 'Let us call the allotment shed the hive house.',
    text: 'The owner and the assistant call the allotment shed the hive house.',
    quote: 'call the allotment shed the hive house',
    subject: 'shared',
  });

  await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  const recalled = await memory.store.recall({});

  expect(recalled.items.map((item) => [item.itemID, item.subject])).toStrictEqual([
    [pending.itemID, 'shared'],
  ]);
});

test('it creates a shared item when you approve its proposal, marked in records of their own', async () => {
  const memory = await startTestMemory();

  await memory.store.writes.remember({
    text: 'The owner and the assistant call the kettle Captain Steam',
    subject: 'shared',
    caller: buildMockWriteCaller(),
  });

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  const approved = await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  invariant(approved.status === 'applied');

  const [records, item] = await Promise.all([
    readRecords(memory.log, {
      afterSequence: 0,
      kinds: ['memory.proposal_shared_noted', 'memory.shared_noted'],
    }),
    memory.writer.db
      .$extendTables<MemoryTables>()
      .selectFrom('memory_items')
      .select(['subject', 'kind'])
      .where('item_id', '=', approved.itemID)
      .executeTakeFirstOrThrow(),
  ]);

  expect(pending.subject).toBe('shared');

  expect(records.map((entry) => entry.record.payload)).toStrictEqual([
    { proposalID: pending.proposalID },
    { itemID: approved.itemID },
  ]);

  expect(item).toStrictEqual({ subject: 'shared', kind: 'fact' });
});

test('it keeps an item a self-note when you approve an edit of it', async () => {
  const memory = await startTestMemory();

  const note = await memory.store.remember({
    text: 'I like short answers in the morning',
    subject: 'self',
    provenance: {
      origin: 'conversation',
      source: 'untrusted',
      taskID: 'conversation',
      proposalID: null,
      checks: null,
    },
  });

  const pending = await createProposal(memory.store, {
    text: 'I like short answers in the morning and the evening',
    target: note,
  });

  await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  const item = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['subject', 'version'])
    .where('item_id', '=', note.itemID)
    .executeTakeFirstOrThrow();

  expect(item).toStrictEqual({ subject: 'self', version: 2 });
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

test.each([
  ['as proposed', {}, 'Rides a green cargo bike', 'conversation'],
  [
    'with your edited text',
    { editedText: 'Rides a dark green cargo bike' },
    'Rides a dark green cargo bike',
    'owner',
  ],
] as const)(
  'it applies an approved proposal from a photo %s with the photo as its source, not your words',
  async (_label, edit, text, origin) => {
    const memory = await startTestMemory();

    const photo = await writeOwnerMessageRecord(memory.log, {
      thread: 'conversation',
      text: 'Look at this',
      spans: [{ start: 0, end: 12, source: 'typed' }],
      images: ['image/jpeg'],
    });

    const outcome = await memory.store.writes.remember({
      text: 'Rides a green cargo bike',
      image: { messageSequence: photo, image: 1 },
      caller: buildMockWriteCaller(),
    });

    const [pending] = await memory.store.proposals.listPending();

    invariant(outcome.status === 'proposed' && pending);

    await memory.store.proposals.approve({
      proposalID: pending.proposalID,
      actionHash: pending.actionHash,
      identityID: 'identity-1',
      ...edit,
    });

    const row = await memory.writer.db
      .$extendTables<MemoryTables>()
      .selectFrom('memory_versions')
      .select(['origin', 'source', 'checks', 'evidence'])
      .where('item_id', '=', pending.itemID)
      .executeTakeFirstOrThrow();

    const history = await memory.store.readHistory(pending.itemID);

    expect(row).toStrictEqual({
      origin,
      source: 'untrusted',
      checks: JSON.stringify({ tokens: 'pass', image: { messageSequence: photo, image: 1 } }),
      evidence: null,
    });

    expect(history?.versions).toStrictEqual([
      {
        version: 1,
        change: 'created',
        state: 'active',
        status: 'readable',
        text,
        origin,
        source: 'untrusted',
        recordedAt: expect.toBeNumber(),
      },
    ]);
  },
);

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

test('it holds an approval whose text a live item matches when more lapsed items rank above that item', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  await Promise.all(
    Array.from({ length: 5 }, () =>
      memory.store.remember({
        text: 'Owner is allergic to peanuts',
        until: Date.parse('2026-10-19T22:59:59Z'),
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

  const live = await memory.store.remember({
    text: 'The owner is allergic to peanuts, says the nurse',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pending = await createProposal(memory.store, { text: 'Owner is allergic to peanuts' });

  clock.advance(Date.parse('2026-10-20T00:41:00Z') - clock.now());

  const result = await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  expect(result).toMatchObject({ status: 'close_match', item: { itemID: live.itemID } });
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

test('it applies a shared proposal whose text only an owner item matches', async () => {
  const memory = await startTestMemory();

  await memory.store.remember({
    text: 'Calls the garden shed the cabin',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.writes.remember({
    text: 'Calls the garden shed the cabin',
    subject: 'shared',
    caller: buildMockWriteCaller(),
  });

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  const result = await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  expect(result).toStrictEqual({ status: 'applied', itemID: pending.itemID, version: 1 });
});

test('it holds a shared proposal whose text a shared item closely matches, and reports that item', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Calls the garden shed the cabin.',
    subject: 'shared',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.writes.remember({
    text: 'Calls the garden shed the cabin',
    subject: 'shared',
    caller: buildMockWriteCaller(),
  });

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  const result = await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  expect(result).toStrictEqual({
    status: 'close_match',
    item: { itemID: item.itemID, version: 1, text: 'Calls the garden shed the cabin.' },
  });
});

test('it holds a self-note whose text a self-note closely matches when more facts rank above that self-note than the match reads', async () => {
  const memory = await startTestMemory();

  const owner = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  await Promise.all(
    ['one', 'two', 'three', 'four', 'five'].map((word) =>
      memory.store.remember({
        text: `Dry jokes land better than puns, dry jokes and puns, ${word}`,
        provenance: owner,
      }),
    ),
  );

  const note = await memory.store.remember({
    text: 'I find dry jokes land better than puns.',
    subject: 'self',
    provenance: { ...owner, origin: 'conversation', source: 'untrusted' },
  });

  await memory.store.writes.remember({
    text: 'Dry jokes land better than puns',
    subject: 'self',
    caller: buildMockWriteCaller(),
  });

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  const result = await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  expect(result).toStrictEqual({
    status: 'close_match',
    item: { itemID: note.itemID, version: 1, text: 'I find dry jokes land better than puns.' },
  });
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
    readItemKey(memory.log, pending.itemID),
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

test('it refuses to apply a shared proposal as a revision of a fact about the owner, and leaves the fact as it was', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Calls the garden shed the cabin',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.writes.remember({
    text: 'The owner and the assistant call the garden shed the cabin',
    subject: 'shared',
    caller: buildMockWriteCaller(),
  });

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  const approval = memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
    revisionOf: { itemID: item.itemID, version: item.version },
  });

  await approval.catch(() => {});

  const history = await memory.store.readHistory(item.itemID);

  expect(approval).rejects.toThrowWithMessage(
    SelfNoteError,
    `memory item ${item.itemID} is not a shared item, so it cannot take this text`,
  );

  expect(history?.versions).toMatchObject([
    { version: 1, text: 'Calls the garden shed the cabin' },
  ]);
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

  expect(results.toSorted((left, right) => left.status.localeCompare(right.status))).toStrictEqual([
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
