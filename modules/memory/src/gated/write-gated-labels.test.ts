import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildMockWriteCaller, startTestMemory } from '../test-utils';
import { buildAllowVerdict } from '../test-utils/build-allow-verdict';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import type { MemoryTables } from '../types';
import { SelfNoteError } from '../utils/error/self-note-error';

test('it records a pass for the token check when the labels add no number the text lacks', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'The shed key is the brass one, number 14',
    labels: { gist: 'shed key', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  await memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'shed key 14', topic: 'home', triggers: [] },
    caller: buildMockWriteCaller(),
  });

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select(['review_reason', 'checks'])
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({
    review_reason: 'labels',
    checks: JSON.stringify({ tokens: 'pass' }),
  });
});

test('it records a fail for the token check when a label holds a phone number the text lacks', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'The shed key is the brass one',
    labels: { gist: 'shed key', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  await memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'shed key 0412 555 019', topic: 'home', triggers: [] },
    caller: buildMockWriteCaller(),
  });

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select(['review_reason', 'checks'])
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({
    review_reason: 'labels',
    checks: JSON.stringify({ tokens: 'fail' }),
  });
});

test('it gives a label with a hidden character the invisible character reason', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'The shed key is the brass one',
    labels: { gist: 'shed key', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  await memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'shed​key', topic: 'home', triggers: [] },
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  expect(pending).toMatchObject([{ reason: 'invisible_character' }]);
});

test.each([
  { from: 'conversation', caller: { origin: 'conversation' } },
  { from: 'task', caller: { origin: 'task', taskID: 'task-1', runID: 'run-1' } },
] as const)(
  'it writes a proposal and its labels and changes no item for a label-only edit from the $from',
  async (testCase) => {
    const memory = await startTestMemory();

    const item = await memory.store.remember({
      text: 'The piano is tuned each March',
      labels: { gist: 'piano tuned each March', topic: 'home', triggers: [] },
      provenance: buildMockProvenance(),
    });

    const before = await readRecords(memory.log, { afterSequence: 0, limit: 1000 });

    const outcome = await memory.store.writes.editLabels({
      target: item,
      labels: { gist: 'piano tuning', topic: 'home', triggers: ['piano'] },
      caller: buildMockWriteCaller(testCase.caller),
    });

    const after = await readRecords(memory.log, {
      afterSequence: before.at(-1)?.record.sequence ?? 0,
      limit: 1000,
    });

    const row = await memory.writer.db
      .$extendTables<MemoryTables>()
      .selectFrom('memory_items')
      .select(['version', 'label_edits'])
      .executeTakeFirstOrThrow();

    expect(outcome).toMatchObject({ status: 'proposed', reason: 'labels' });

    expect(after.map((entry) => entry.record.kind)).toIncludeSameMembers([
      'proposals.proposed',
      'memory.proposed',
      'memory.proposal_labelled',
    ]);

    expect(row).toStrictEqual({ version: 1, label_edits: 0 });
  },
);

test('it approves a label-only proposal with one label record that holds exactly the reviewed labels and writes no version', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'The piano is tuned each March',
    labels: { gist: 'piano tuned each March', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  await memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'piano tuning', topic: 'home/music', triggers: ['piano', 'tuner'] },
    caller: buildMockWriteCaller(),
  });

  const [proposal] = await memory.store.proposals.listPending();

  invariant(proposal);

  const before = await readRecords(memory.log, { afterSequence: 0, limit: 1000 });

  await memory.store.proposals.approve({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'host',
  });

  const written = await readRecords(memory.log, {
    afterSequence: before.at(-1)?.record.sequence ?? 0,
    limit: 1000,
  });

  const recalled = await memory.store.recall({ itemIDs: [item.itemID] });

  expect(written.map((entry) => entry.record.kind)).not.toContain('memory.version_added');
  expect(written.filter((entry) => entry.record.kind === 'memory.labelled')).toHaveLength(1);

  expect(recalled.items).toMatchObject([
    {
      version: 1,
      revision: 2,
      gist: 'piano tuning',
      topic: 'home/music',
      triggers: ['piano', 'tuner'],
    },
  ]);
});

test('it merges a second label-only edit with the same labels into the waiting proposal', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'The piano is tuned each March',
    labels: { gist: 'piano tuned each March', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  const labels = { gist: 'piano tuning', topic: 'home', triggers: ['piano'] };

  await memory.store.writes.editLabels({ target: item, labels, caller: buildMockWriteCaller() });

  const second = await memory.store.writes.editLabels({
    target: item,
    labels,
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  expect(second).toMatchObject({ status: 'proposed', merged: true });
  expect(pending).toHaveLength(1);
});

test('it keeps a second label-only edit with other labels as its own proposal, stale once the first is approved', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'The piano is tuned each March',
    labels: { gist: 'piano tuned each March', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  const first = await memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'piano tuning', topic: 'home', triggers: [] },
    caller: buildMockWriteCaller(),
  });

  const second = await memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'tuner visit', topic: 'home', triggers: [] },
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  const approved = pending.find(
    (proposal) => first.status === 'proposed' && proposal.proposalID === first.proposalID,
  );

  const other = pending.find(
    (proposal) => second.status === 'proposed' && proposal.proposalID === second.proposalID,
  );

  invariant(approved && other);

  await memory.store.proposals.approve({
    proposalID: approved.proposalID,
    actionHash: approved.actionHash,
    identityID: 'host',
  });

  const stale = memory.store.proposals.approve({
    proposalID: other.proposalID,
    actionHash: other.actionHash,
    identityID: 'host',
  });

  await stale.catch(() => {});

  expect(second).toMatchObject({ status: 'proposed', merged: false });
  expect(pending).toHaveLength(2);
  expect(stale).rejects.toMatchObject({ code: 'STALE_VERSION' });
});

test("it refuses a label-only edit past the turn's proposal cap", async () => {
  const memory = await startTestMemory({
    gate: {
      limits: { evidenceWindow: 20, proposalLapseMs: 1000, proposalCap: 1, closeMatchScore: 0.6 },
    },
  });

  const item = await memory.store.remember({
    text: 'The piano is tuned each March',
    labels: { gist: 'piano tuned each March', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  await memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'piano tuning', topic: 'home', triggers: [] },
    caller: buildMockWriteCaller(),
  });

  const refused = memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'tuner visit', topic: 'home', triggers: [] },
    caller: buildMockWriteCaller(),
  });

  await refused.catch(() => {});

  expect(refused).rejects.toMatchObject({ code: 'PROPOSAL_CAP' });
});

test('it never runs the checker for a label-only edit', async () => {
  const checked: unknown[] = [];

  const memory = await startTestMemory({
    gate: {
      check: (input) => {
        checked.push(input);

        return Promise.reject(new Error('the checker ran'));
      },
    },
  });

  const item = await memory.store.remember({
    text: 'The piano is tuned each March',
    labels: { gist: 'piano tuned each March', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  await memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'piano tuning', topic: 'home', triggers: ['piano'] },
    caller: buildMockWriteCaller(),
  });

  expect(checked).toStrictEqual([]);
});

test("it refuses a task's label-only edit of a self-note, and writes nothing", async () => {
  const memory = await startTestMemory();

  const note = await memory.store.remember({
    text: 'I like tidy lists',
    subject: 'self',
    labels: { gist: 'tidy lists', topic: 'self', triggers: [] },
    provenance: buildMockProvenance(),
  });

  const write = memory.store.writes.editLabels({
    target: note,
    labels: { gist: 'tidy dated lists', topic: 'self', triggers: [] },
    caller: buildMockWriteCaller({ origin: 'task', thread: 'task-1', taskID: 'task-1' }),
  });

  await Promise.allSettled([write]);

  const pending = await memory.store.proposals.listPending();

  expect(write).rejects.toThrowWithMessage(
    SelfNoteError,
    'only the conversation writes a self-note, and this write came from the task',
  );

  expect(pending).toStrictEqual([]);
});

test.each([
  { from: 'conversation', caller: buildMockWriteCaller(), thread: 'conversation' },
  {
    from: 'task',
    caller: buildMockWriteCaller({ origin: 'task', thread: 'task-1', taskID: 'task-1' }),
    thread: 'task-1',
  },
] as const)(
  'it applies a label-only edit at once with a notice under a covering rule, from the $from',
  async (testCase) => {
    const memory = await startTestMemory();

    const item = await memory.store.remember({
      text: 'Keeps a kettlebell by the door',
      labels: { gist: 'kettlebell', topic: 'home', triggers: [] },
      provenance: buildMockProvenance(),
    });

    const outcome = await memory.store.writes.editLabels({
      target: item,
      labels: { gist: 'kettlebell by the door', topic: 'home', triggers: ['gym'] },
      caller: testCase.caller,
      verdict: buildAllowVerdict(),
    });

    const labels = await memory.store.writes.readItemLabels(item.itemID);
    const notices = await memory.store.readNotices(testCase.thread);

    expect(outcome).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 2 });

    expect(labels).toStrictEqual({
      gist: 'kettlebell by the door',
      topic: 'home',
      triggers: ['gym'],
    });

    expect(notices.flatMap((notice) => notice.entries)).toMatchObject([
      { itemID: item.itemID, change: 'labelled', version: null },
    ]);
  },
);

test.each([
  { from: 'conversation', caller: buildMockWriteCaller(), thread: 'conversation' },
  {
    from: 'task',
    caller: buildMockWriteCaller({ origin: 'task', thread: 'task-1', taskID: 'task-1' }),
    thread: 'task-1',
  },
] as const)(
  'it applies a self-note label edit at once with a notice under a rule that checks subject is self, from the $from',
  async (testCase) => {
    const memory = await startTestMemory();

    const item = await memory.store.remember({
      text: 'Keeps a kettlebell by the door',
      labels: { gist: 'kettlebell', topic: 'home', triggers: [] },
      subject: 'self',
      provenance: buildMockProvenance(),
    });

    const outcome = await memory.store.writes.editLabels({
      target: item,
      labels: { gist: 'opening question', topic: 'habits', triggers: [] },
      caller: testCase.caller,
      verdict: buildAllowVerdict([{ arg: 'subject', op: 'eq', value: 'self' }]),
    });

    const notices = await memory.store.readNotices(testCase.thread);

    expect(outcome).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 2 });

    expect(notices.flatMap((notice) => notice.entries)).toMatchObject([
      { itemID: item.itemID, change: 'labelled' },
    ]);
  },
);

test('it makes a label-only edit with a hidden character a proposal under a covering rule', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Keeps a kettlebell by the door',
    labels: { gist: 'kettlebell', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  const outcome = await memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'kettle\u200Bbell', topic: 'home', triggers: [] },
    caller: buildMockWriteCaller(),
    verdict: buildAllowVerdict(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'invisible_character' });
});

test('it makes a label-only edit a proposal with the reason ask_rule under an ask rule', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Keeps a kettlebell by the door',
    labels: { gist: 'kettlebell', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  const outcome = await memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'kettlebell by the door', topic: 'home', triggers: [] },
    caller: buildMockWriteCaller(),
    verdict: { kind: 'rule-ask', rule: { id: 'rule-b', revision: 3 } },
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'ask_rule' });
});

test('it holds a granted task self-note label edit for review, and its approval stores the labels', async () => {
  const memory = await startTestMemory();

  const note = await memory.store.remember({
    text: 'I like tidy lists',
    subject: 'self',
    labels: { gist: 'tidy lists', topic: 'self', triggers: [] },
    provenance: buildMockProvenance(),
  });

  const outcome = await memory.store.writes.editLabels({
    target: note,
    labels: { gist: 'tidy lists', topic: 'habits', triggers: [] },
    caller: buildMockWriteCaller({
      origin: 'task',
      thread: 'task-1',
      taskID: 'task-1',
      hasSelfNoteGrant: true,
    }),
  });

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  const recalled = await memory.store.recall({ itemIDs: [note.itemID], includeHistory: true });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'labels' });

  expect(recalled.items).toMatchObject([
    {
      topic: 'habits',
      labelHistory: [
        { revision: 1, topic: 'self' },
        { revision: 2, topic: 'habits' },
      ],
    },
  ]);
});

test('it refuses a label edit of an owner item through a tool that only the grant gives a task', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    labels: { gist: 'home', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  const write = memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'home', topic: 'address', triggers: [] },
    caller: buildMockWriteCaller({
      origin: 'task',
      thread: 'task-1',
      taskID: 'task-1',
      hasSelfNoteGrant: true,
      isSelfNoteOnly: true,
    }),
  });

  expect(write).rejects.toThrow(SelfNoteError);
});

test('it refuses a task with no grant a self-note label edit', async () => {
  const memory = await startTestMemory();

  const note = await memory.store.remember({
    text: 'I like tidy lists',
    subject: 'self',
    labels: { gist: 'tidy lists', topic: 'self', triggers: [] },
    provenance: buildMockProvenance(),
  });

  const write = memory.store.writes.editLabels({
    target: note,
    labels: { gist: 'tidy dated lists', topic: 'self', triggers: [] },
    caller: buildMockWriteCaller({ origin: 'task', thread: 'task-1', taskID: 'task-1' }),
  });

  expect(write).rejects.toThrow(SelfNoteError);
});
