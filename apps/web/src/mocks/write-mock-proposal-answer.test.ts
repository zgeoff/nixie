import { expect, test } from 'bun:test';
import { store } from './store';
import { writeMockProposalAnswer } from './write-mock-proposal-answer';

test('it approves a new item proposal as a new item with its own approval record', async () => {
  const proposal = await store.memoryProposals.create({ text: 'Keeps bees on the roof' });

  const outcome = await writeMockProposalAnswer({
    answer: 'approve',
    actionHash: proposal.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
  });

  const item = store.memoryItems.findFirst((query) => query.where({ itemID: proposal.itemID }));

  expect(outcome).toStrictEqual({ proposalID: proposal.proposalID, status: 'applied' });

  expect(item?.versions).toMatchObject([
    { origin: 'memory_writer', source: 'untrusted', text: 'Keeps bees on the roof' },
  ]);

  expect(store.records.all()).toMatchObject([
    {
      answer: { answer: 'approved', identityID: 'session-a', proposalID: proposal.proposalID },
      kind: 'memory.approval_recorded',
    },
  ]);
});

test('it approves edited text as your own words, and records the answer as edited', async () => {
  const proposal = await store.memoryProposals.create({ text: 'Keeps bes on the roof' });

  await writeMockProposalAnswer({
    answer: 'approve',
    actionHash: proposal.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    editedText: 'Keeps bees on the roof',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
  });

  const item = store.memoryItems.findFirst((query) => query.where({ itemID: proposal.itemID }));

  expect(item?.versions).toMatchObject([
    { origin: 'owner', source: 'owner', text: 'Keeps bees on the roof' },
  ]);

  expect(store.records.all()).toMatchObject([{ answer: { answer: 'edited' } }]);
});

test('it holds an approval whose text an active item states, and applies nothing', async () => {
  const item = await store.memoryItems.create({ versions: [{ text: 'Keeps bees on the roof' }] });
  const proposal = await store.memoryProposals.create({ text: 'keeps bees on the roof' });

  const outcome = await writeMockProposalAnswer({
    answer: 'approve',
    actionHash: proposal.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
  });

  expect(outcome).toStrictEqual({
    item: { itemID: item.itemID, text: 'Keeps bees on the roof', version: 1 },
    proposalID: proposal.proposalID,
    status: 'close_match',
  });

  expect(store.records.all()).toStrictEqual([]);
});

test('it applies a held approval as a revision of the item that matched', async () => {
  const item = await store.memoryItems.create({ versions: [{ text: 'Keeps bees on the roof' }] });
  const proposal = await store.memoryProposals.create({ text: 'keeps bees on the roof' });

  await writeMockProposalAnswer({
    answer: 'approve',
    actionHash: proposal.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
    revisionOf: { itemID: item.itemID, version: 1 },
  });

  const stored = store.memoryItems.findFirst((query) => query.where({ itemID: item.itemID }));

  expect(stored?.versions).toMatchObject([
    { text: 'Keeps bees on the roof' },
    { change: 'edited', text: 'keeps bees on the roof' },
  ]);
});

test('it rejects a proposal with your reason in its rejection record', async () => {
  const proposal = await store.memoryProposals.create({ text: 'Keeps bees on the roof' });

  const outcome = await writeMockProposalAnswer({
    answer: 'reject',
    actionHash: proposal.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
    reason: 'the bees were a neighbour',
  });

  expect(outcome).toStrictEqual({ proposalID: proposal.proposalID, status: 'rejected' });

  expect(store.records.all()).toMatchObject([
    {
      answer: {
        answer: 'rejected',
        identityID: 'session-a',
        proposalID: proposal.proposalID,
        reason: 'the bees were a neighbour',
      },
      kind: 'memory.proposal_rejected',
    },
  ]);
});

test('it answers a retry with its first outcome and answers once', async () => {
  const proposal = await store.memoryProposals.create({ text: 'Keeps bees on the roof' });

  const answer = {
    answer: 'reject',
    actionHash: proposal.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
  } as const;

  await writeMockProposalAnswer(answer);

  const retried = await writeMockProposalAnswer(answer);

  expect(retried).toStrictEqual({ proposalID: proposal.proposalID, status: 'rejected' });
  expect(store.records.all()).toHaveLength(1);
});

test('it refuses an ID that another answer used', async () => {
  const first = await store.memoryProposals.create({ text: 'Keeps bees on the roof' });
  const second = await store.memoryProposals.create({ text: 'Cycles to work' });

  await writeMockProposalAnswer({
    answer: 'reject',
    actionHash: first.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: first.proposalID,
  });

  const outcome = await writeMockProposalAnswer({
    answer: 'reject',
    actionHash: second.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: second.proposalID,
  });

  expect(outcome).toStrictEqual({
    code: 'CLIENT_ACTION_ID_REUSED',
    proposalID: second.proposalID,
    status: 'refused',
  });
});

test('it answers a proposal past its lapse time as stale, and writes no record', async () => {
  const proposal = await store.memoryProposals.create({
    lapseAt: new Date(Date.now() - 1000),
    text: 'Keeps bees on the roof',
  });

  const outcome = await writeMockProposalAnswer({
    answer: 'approve',
    actionHash: proposal.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
  });

  expect(outcome).toStrictEqual({
    cause: 'lapsed',
    proposalID: proposal.proposalID,
    status: 'stale',
  });

  expect(store.records.all()).toStrictEqual([]);
});

test('it answers a proposal already answered as stale', async () => {
  const proposal = await store.memoryProposals.create({ status: 'rejected' });

  const outcome = await writeMockProposalAnswer({
    answer: 'approve',
    actionHash: proposal.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
  });

  expect(outcome).toMatchObject({ cause: 'answered', status: 'stale' });
});

test('it answers another action hash as stale', async () => {
  const proposal = await store.memoryProposals.create({});

  const outcome = await writeMockProposalAnswer({
    answer: 'approve',
    actionHash: 'sha256:another',
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
  });

  expect(outcome).toMatchObject({ cause: 'changed', status: 'stale' });
});

test('it answers a proposal whose item moved past its target version as stale', async () => {
  const item = await store.memoryItems.create({ versions: [{}, {}] });
  const proposal = await store.memoryProposals.create({ itemID: item.itemID, targetVersion: 1 });

  const outcome = await writeMockProposalAnswer({
    answer: 'approve',
    actionHash: proposal.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
  });

  expect(outcome).toMatchObject({ cause: 'moved', status: 'stale' });
});

test('it answers an unknown proposal as stale', async () => {
  const outcome = await writeMockProposalAnswer({
    answer: 'reject',
    actionHash: 'sha256:any',
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: '0b8f1d2e-4c6a-4e9b-8d3f-1a2b3c4d5e6f',
  });

  expect(outcome).toMatchObject({ cause: 'gone', status: 'stale' });
});

test('it retires the item that a retirement proposal names', async () => {
  const item = await store.memoryItems.create({ versions: [{ text: 'Keeps bees on the roof' }] });

  const proposal = await store.memoryProposals.create({
    itemID: item.itemID,
    operation: 'retire',
    targetVersion: 1,
  });

  await writeMockProposalAnswer({
    answer: 'approve',
    actionHash: proposal.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
  });

  const stored = store.memoryItems.findFirst((query) => query.where({ itemID: item.itemID }));

  expect(stored?.state).toBe('retired');
});

test('it refuses edited text for a retirement proposal', async () => {
  const item = await store.memoryItems.create({ versions: [{}] });

  const proposal = await store.memoryProposals.create({
    itemID: item.itemID,
    operation: 'retire',
    targetVersion: 1,
  });

  const outcome = await writeMockProposalAnswer({
    answer: 'approve',
    actionHash: proposal.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    editedText: 'Keeps no bees',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
  });

  expect(outcome).toMatchObject({ code: 'RETIREMENT_EDIT', status: 'refused' });
});

test('it answers a revision of an item that moved past the version the answer names as stale, and writes nothing', async () => {
  const item = await store.memoryItems.create({
    versions: [{ text: 'Keeps bees on the roof' }, { text: 'Keeps bees in the garden' }],
  });

  const proposal = await store.memoryProposals.create({ text: 'keeps bees on the roof' });

  const outcome = await writeMockProposalAnswer({
    answer: 'approve',
    actionHash: proposal.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
    revisionOf: { itemID: item.itemID, version: 1 },
  });

  const stored = store.memoryItems.findFirst((query) => query.where({ itemID: item.itemID }));

  expect(outcome).toStrictEqual({
    cause: 'moved',
    proposalID: proposal.proposalID,
    status: 'stale',
  });

  expect(stored?.versions).toHaveLength(2);
  expect(store.records.all()).toStrictEqual([]);
});

test('it answers a revision of an item that does not exist as stale', async () => {
  const proposal = await store.memoryProposals.create({});

  const outcome = await writeMockProposalAnswer({
    answer: 'approve',
    actionHash: proposal.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
    revisionOf: { itemID: '0b8f1d2e-4c6a-4e9b-8d3f-1a2b3c4d5e6f', version: 1 },
  });

  expect(outcome).toMatchObject({ cause: 'gone', status: 'stale' });
});

test('it applies a revision of a retired item, and the item stays retired', async () => {
  const item = await store.memoryItems.create({
    state: 'retired',
    versions: [{ state: 'retired', text: 'Keeps bees on the roof' }],
  });

  const proposal = await store.memoryProposals.create({ text: 'Keeps two hives on the roof' });

  const outcome = await writeMockProposalAnswer({
    answer: 'approve',
    actionHash: proposal.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
    revisionOf: { itemID: item.itemID, version: 1 },
  });

  const stored = store.memoryItems.findFirst((query) => query.where({ itemID: item.itemID }));

  expect(outcome).toStrictEqual({ proposalID: proposal.proposalID, status: 'applied' });
  expect(stored?.state).toBe('retired');

  expect(stored?.versions).toMatchObject([
    { state: 'retired', text: 'Keeps bees on the roof' },
    { change: 'edited', state: 'retired', text: 'Keeps two hives on the roof' },
  ]);
});

test('it refuses a revision that takes the pinned core past its budget, and writes nothing', async () => {
  await store.memoryItems.create({ isPinned: true, versions: [{ text: 'b'.repeat(7960) }] });

  const item = await store.memoryItems.create({
    isPinned: true,
    versions: [{ text: 'Keeps bees on the roof' }],
  });

  const proposal = await store.memoryProposals.create({
    text: 'Keeps bees on the roof and in the back garden',
  });

  const outcome = await writeMockProposalAnswer({
    answer: 'approve',
    actionHash: proposal.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
    revisionOf: { itemID: item.itemID, version: 1 },
  });

  const stored = store.memoryItems.findFirst((query) => query.where({ itemID: item.itemID }));

  expect(outcome).toStrictEqual({
    code: 'PINNED_CORE_FULL',
    proposalID: proposal.proposalID,
    status: 'refused',
  });

  expect(stored?.versions).toHaveLength(1);
  expect(store.records.all()).toStrictEqual([]);
  expect(store.memoryActions.all()).toStrictEqual([]);
});

test('it applies a revision of a pinned item that still fits the pinned core', async () => {
  await store.memoryItems.create({ isPinned: true, versions: [{ text: 'b'.repeat(7960) }] });

  const item = await store.memoryItems.create({
    isPinned: true,
    versions: [{ text: 'Keeps bees on the roof' }],
  });

  const proposal = await store.memoryProposals.create({ text: 'Keeps bees on the back roof' });

  const outcome = await writeMockProposalAnswer({
    answer: 'approve',
    actionHash: proposal.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
    revisionOf: { itemID: item.itemID, version: 1 },
  });

  expect(outcome).toStrictEqual({ proposalID: proposal.proposalID, status: 'applied' });
});

test('it refuses a revision target for a proposal that already names its item', async () => {
  const item = await store.memoryItems.create({ versions: [{}] });
  const other = await store.memoryItems.create({ versions: [{}] });
  const proposal = await store.memoryProposals.create({ itemID: item.itemID, targetVersion: 1 });

  const outcome = await writeMockProposalAnswer({
    answer: 'approve',
    actionHash: proposal.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
    revisionOf: { itemID: other.itemID, version: 1 },
  });

  expect(outcome).toMatchObject({ code: 'REVISION_TARGET', status: 'refused' });
});

test('it refuses a revision of an item of the other kind as a revision target', async () => {
  const item = await store.memoryItems.create({ versions: [{ text: 'Likes slow mornings' }] });
  const proposal = await store.memoryProposals.create({ kind: 'self', reason: 'self_note' });

  const outcome = await writeMockProposalAnswer({
    answer: 'approve',
    actionHash: proposal.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
    revisionOf: { itemID: item.itemID, version: 1 },
  });

  expect(outcome).toMatchObject({ code: 'REVISION_TARGET', status: 'refused' });
});

test('it approves a self-note proposal as a new self-note', async () => {
  const proposal = await store.memoryProposals.create({
    kind: 'self',
    reason: 'self_note',
    text: 'Enjoys a slow morning question',
  });

  await writeMockProposalAnswer({
    answer: 'approve',
    actionHash: proposal.actionHash,
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    identityID: 'session-a',
    proposalID: proposal.proposalID,
  });

  const stored = store.memoryItems.findFirst((query) => query.where({ itemID: proposal.itemID }));

  expect(stored?.kind).toBe('self');
});
