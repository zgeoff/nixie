import { expect, mock, test } from 'bun:test';
import {
  buildSpanStateFromEvents,
  gboardPastedEvents,
  gboardTypedEvents,
} from '@heynixie/contract/test-utils';
import { writeRecords } from '@heynixie/log';
import { makeChecker } from '@heynixie/sessions';
import { buildTestClock, makeGatedCall } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import {
  buildMockCheckerAnswer,
  buildMockWriteCaller,
  startTestMemory,
  writeModelReplyRecord,
} from './test-utils';
import { makeToolAllowRule } from './test-utils/make-tool-allow-rule';
import { removeMessageKey } from './test-utils/remove-message-key';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';
import type { MemoryTables } from './types';

test('it applies a backed write with your words as its source, each verdict and the model', async () => {
  const memory = await startTestMemory({
    gate: {
      check: () => Promise.resolve(buildMockCheckerAnswer({ model: 'claude-sonnet-5-5' })),
    },
  });

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Remember that I take my coffee black',
    spans: [{ start: 0, end: 36, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
    caller: buildMockWriteCaller({ model: 'claude-opus-5-5' }),
  });

  invariant(outcome.status === 'applied');

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .select(['origin', 'source', 'evidence', 'checks', 'model'])
    .where('item_id', '=', outcome.itemID)
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({
    origin: 'conversation',
    source: 'owner',
    evidence: JSON.stringify({ recordSequence: sequence, start: 14, end: 36 }),
    checks: JSON.stringify({
      quote: 'pass',
      tokens: 'pass',
      checker: { verdict: 'asserted', model: 'claude-sonnet-5-5', failure: null },
    }),
    model: 'claude-opus-5-5',
  });
});

test('it proposes a write that cites no quote', async () => {
  const memory = await startTestMemory();

  const outcome = await memory.store.writes.remember({
    text: 'Takes coffee black',
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    reason: 'no_quote',
    merged: false,
  });
});

test('it proposes a write whose quote lies in a pasted span, before the checker runs', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer()));

  const memory = await startTestMemory({ gate: { check } });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Look at this: my new email is mallory@attacker.example',
    spans: [
      { start: 0, end: 14, source: 'typed' },
      { start: 14, end: 54, source: 'pasted' },
    ],
  });

  const outcome = await memory.store.writes.remember({
    text: 'Email is mallory@attacker.example',
    quote: 'my new email is mallory@attacker.example',
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'quote_not_typed' });
  expect(check).not.toHaveBeenCalled();
});

test('it applies a write that quotes words typed on Gboard, a run-together word it split included', async () => {
  const memory = await startTestMemory({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer()) },
  });

  const typed = buildSpanStateFromEvents(gboardTypedEvents['respaced-autocorrect']);

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: typed.text,
    spans: typed.spans,
  });

  const outcome = await memory.store.writes.remember({
    text: 'The garden gate sticks',
    quote: 'The garden gate sticks',
    caller: buildMockWriteCaller(),
  });

  expect(outcome.status).toBe('applied');
});

test('it proposes a write that quotes words Gboard inserted from the clipboard chip', async () => {
  const memory = await startTestMemory({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer()) },
  });

  const chip = buildSpanStateFromEvents(gboardPastedEvents.chip);

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: chip.text,
    spans: chip.spans,
  });

  const outcome = await memory.store.writes.remember({
    text: 'chip test words',
    quote: 'chip test words',
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'quote_not_typed' });
});

test('it proposes a write whose quote lies in a blockquote', async () => {
  const memory = await startTestMemory({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer()) },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: "My sister wrote:\n> I moved to Lisbon\nIsn't that great?",
    spans: [{ start: 0, end: 54, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'Lives in Lisbon',
    quote: 'I moved to Lisbon',
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'quote_in_quoted_block' });
});

test('it proposes a write whose text holds a token the quote lacks', async () => {
  const memory = await startTestMemory({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer()) },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Send the invoices to my work address from now on',
    spans: [{ start: 0, end: 48, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'Invoices go to billing@attacker.example',
    quote: 'Send the invoices to my work address',
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'token_missing' });
});

test.each([
  { label: 'not asserted', verdict: 'not_asserted', failure: null, reason: 'checker_not_asserted' },
  { label: 'unsure', verdict: 'unsure', failure: null, reason: 'checker_unsure' },
  { label: 'unreadably', verdict: 'unsure', failure: 'unreadable', reason: 'checker_unsure' },
  { label: 'with a failure', verdict: 'unsure', failure: 'error', reason: 'checker_unreachable' },
] as const)('it proposes a write when the checker answers $label', async (row) => {
  const memory = await startTestMemory({
    gate: {
      check: () =>
        Promise.resolve(buildMockCheckerAnswer({ verdict: row.verdict, failure: row.failure })),
    },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Am I allergic to penicillin?',
    spans: [{ start: 0, end: 28, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'Allergic to penicillin',
    quote: 'allergic to penicillin',
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: row.reason });
});

test('it proposes a write when the checker times out', async () => {
  const memory = await startTestMemory({
    gate: {
      check: makeChecker({
        ask: () => Promise.withResolvers<never>().promise,
        model: 'claude-sonnet-5-5',

        clock: buildTestClock(1_700_000_000_000),
        timeoutMs: 0,
      }),
    },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'checker_unreachable' });
});

test('it gives the checker only your one message and the memory text', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer()));

  const memory = await startTestMemory({ gate: { check } });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'My old number was 0400 000 001',
    spans: [{ start: 0, end: 30, source: 'typed' }],
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'My new number is 0400 000 002, the old one is gone: see screenshot',
    spans: [
      { start: 0, end: 52, source: 'typed' },
      { start: 52, end: 66, source: 'pasted' },
    ],
  });

  await memory.store.writes.remember({
    text: 'Phone number is 0400 000 002',
    quote: 'My new number is 0400 000 002',
    caller: buildMockWriteCaller(),
  });

  expect(check).toHaveBeenCalledExactlyOnceWith({
    prompt: expect.toStartWith('You check one candidate memory'),
    input:
      '<owner_message>\n' +
      '«evidence»My new number is 0400 000 002«/evidence», the old one is gone: «pasted»see screenshot«/pasted»\n' +
      '</owner_message>\n\n' +
      '<candidate_memory>\nPhone number is 0400 000 002\n</candidate_memory>',
  });
});

test('it proposes a write that cites the evidence message of an item you forgot', async () => {
  const memory = await startTestMemory({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer()) },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  const first = await memory.store.writes.remember({
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
    caller: buildMockWriteCaller(),
  });

  invariant(first.status === 'applied');

  await memory.store.forget({
    target: { itemID: first.itemID, version: first.version },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const again = await memory.store.writes.remember({
    text: 'Drinks black coffee',
    quote: 'I take my coffee black',
    caller: buildMockWriteCaller(),
  });

  expect(again).toMatchObject({ status: 'proposed', reason: 'forgotten_evidence' });
});

test('it proposes a write whose evidence message backed an item you forgot while the checker answered', async () => {
  const checker = makeGatedCall(() => buildMockCheckerAnswer());

  const memory = await startTestMemory({ gate: { check: checker.call } });

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  const forgotten = await memory.store.remember({
    text: 'Takes coffee black',
    evidenceQuote: 'I take my coffee black',
    evidence: { recordSequence: sequence, start: 0, end: 22 },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const write = memory.store.writes.remember({
    text: 'Drinks black coffee',
    quote: 'I take my coffee black',
    caller: buildMockWriteCaller(),
  });

  await checker.started;

  await memory.store.forget({
    target: forgotten,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  checker.release();

  const outcome = await write;

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'forgotten_evidence' });
});

test('it proposes a write for another item that cites a message a forgotten item shared', async () => {
  const memory = await startTestMemory({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer()) },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black and I cycle to work',
    spans: [{ start: 0, end: 42, source: 'typed' }],
  });

  const coffee = await memory.store.writes.remember({
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
    caller: buildMockWriteCaller(),
  });

  invariant(coffee.status === 'applied');

  await memory.store.forget({
    target: { itemID: coffee.itemID, version: coffee.version },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const cycling = await memory.store.writes.remember({
    text: 'Cycles to work',
    quote: 'I cycle to work',
    caller: buildMockWriteCaller(),
  });

  expect(cycling).toMatchObject({ status: 'proposed', reason: 'forgotten_evidence' });
});

test('it proposes a write whose quote lies only in a message outside the window', async () => {
  const memory = await startTestMemory({
    gate: {
      check: () => Promise.resolve(buildMockCheckerAnswer()),
      limits: { evidenceWindow: 1, proposalLapseMs: 1000, proposalCap: 10, closeMatchScore: 0.6 },
    },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Thanks',
    spans: [{ start: 0, end: 6, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'no_quote' });
});

test('it applies a write whose quote you typed in a message outside the window, cited by its event ID', async () => {
  const memory = await startTestMemory({
    gate: {
      check: () => Promise.resolve(buildMockCheckerAnswer()),
      limits: { evidenceWindow: 1, proposalLapseMs: 1000, proposalCap: 10, closeMatchScore: 0.6 },
    },
  });

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Thanks',
    spans: [{ start: 0, end: 6, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
    eventID: sequence,
    caller: buildMockWriteCaller(),
  });

  invariant(outcome.status === 'applied');

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .select(['source', 'evidence'])
    .where('item_id', '=', outcome.itemID)
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({
    source: 'owner',
    evidence: JSON.stringify({ recordSequence: sequence, start: 0, end: 22 }),
  });
});

test('it proposes a write whose quote matches only a fetched page in the log, cited by its event ID', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer()));

  const memory = await startTestMemory({ gate: { check } });

  const [page] = await writeRecords(memory.log, [
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'untrusted',
      payload: { outcome: 'result', sources: { text: 'untrusted' } },
      erasable: { result: { text: 'The owner prefers window seats on every flight' } },
    },
  ]);

  invariant(page);

  const outcome = await memory.store.writes.remember({
    text: 'Prefers window seats',
    quote: 'The owner prefers window seats on every flight',
    eventID: page.sequence,
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'quote_not_typed' });
  expect(check).not.toHaveBeenCalled();
});

test('it refuses a proposal past the cap for the turn', async () => {
  const memory = await startTestMemory({
    gate: {
      limits: { evidenceWindow: 20, proposalLapseMs: 1000, proposalCap: 2, closeMatchScore: 0.6 },
    },
  });

  await memory.store.writes.remember({ text: 'Fact one', caller: buildMockWriteCaller() });
  await memory.store.writes.remember({ text: 'Fact two', caller: buildMockWriteCaller() });

  const third = memory.store.writes.remember({
    text: 'Fact three',
    caller: buildMockWriteCaller(),
  });

  await third.catch(() => {});

  expect(third).rejects.toMatchObject({ code: 'PROPOSAL_CAP' });
});

test('it counts the cap again from your next message', async () => {
  const memory = await startTestMemory({
    gate: {
      limits: { evidenceWindow: 20, proposalLapseMs: 1000, proposalCap: 1, closeMatchScore: 0.6 },
    },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Hello',
    spans: [{ start: 0, end: 5, source: 'typed' }],
  });

  await memory.store.writes.remember({ text: 'Fact one', caller: buildMockWriteCaller() });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Again',
    spans: [{ start: 0, end: 5, source: 'typed' }],
  });

  const next = await memory.store.writes.remember({
    text: 'Fact two',
    caller: buildMockWriteCaller(),
  });

  expect(next).toMatchObject({ status: 'proposed', reason: 'no_quote' });
});

test('it refuses an edit of a version that moved on before any check runs', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer()));

  const memory = await startTestMemory({ gate: { check } });

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.remember({
    text: 'Lives on Oak Avenue',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const edit = memory.store.writes.remember({
    text: 'Lives on Pine Road',
    quote: 'I live on Pine Road',
    target: item,
    caller: buildMockWriteCaller(),
  });

  await edit.catch(() => {});

  expect(edit).rejects.toMatchObject({ code: 'STALE_VERSION' });
  expect(check).not.toHaveBeenCalled();
});

test('it applies a write under your allow rule with outside content as its source', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer({ verdict: 'not_asserted' })));

  const memory = await startTestMemory({
    gate: { check, findAllowRule: () => Promise.resolve({ ruleID: 'rule-a', revision: 2 }) },
  });

  const outcome = await memory.store.writes.remember({
    text: 'Likes jazz',
    caller: buildMockWriteCaller(),
  });

  invariant(outcome.status === 'applied');

  const history = await memory.store.readHistory(outcome.itemID);

  expect(history?.versions).toMatchObject([{ source: 'untrusted', origin: 'conversation' }]);
  expect(check).not.toHaveBeenCalled();
});

test('it proposes a write under your allow rule whose token you never typed', async () => {
  const memory = await startTestMemory({
    gate: { findAllowRule: () => Promise.resolve({ ruleID: 'rule-a', revision: 2 }) },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Write to me at sam@example.com',
    spans: [{ start: 0, end: 30, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'Email is sam@attacker.example',
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'token_missing' });
});

test('it runs the full gate on an edit when your allow rule names only memory.remember', async () => {
  const memory = await startTestMemory({
    gate: { findAllowRule: makeToolAllowRule('memory.remember') },
  });

  const item = await memory.store.remember({
    text: 'Likes jazz',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const created = await memory.store.writes.remember({
    text: 'Likes opera',
    caller: buildMockWriteCaller(),
  });

  const edited = await memory.store.writes.remember({
    text: 'Likes blues',
    target: item,
    caller: buildMockWriteCaller(),
  });

  expect(created).toMatchObject({ status: 'applied' });
  expect(edited).toMatchObject({ status: 'proposed', reason: 'no_quote' });
});

test('it runs the full gate on a new item when your allow rule names only memory.edit', async () => {
  const memory = await startTestMemory({
    gate: { findAllowRule: makeToolAllowRule('memory.edit') },
  });

  const item = await memory.store.remember({
    text: 'Likes jazz',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const edited = await memory.store.writes.remember({
    text: 'Likes blues',
    target: item,
    caller: buildMockWriteCaller(),
  });

  const created = await memory.store.writes.remember({
    text: 'Likes opera',
    caller: buildMockWriteCaller(),
  });

  expect(edited).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 2 });
  expect(created).toMatchObject({ status: 'proposed', reason: 'no_quote' });
});

test("it groups a turn's applied writes and proposals under one notice", async () => {
  const memory = await startTestMemory({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer()) },
  });

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  const applied = await memory.store.writes.remember({
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
    caller: buildMockWriteCaller(),
  });

  const proposed = await memory.store.writes.remember({
    text: 'Likes jazz',
    caller: buildMockWriteCaller(),
  });

  const notices = await memory.store.readNotices('conversation');

  invariant(applied.status === 'applied' && proposed.status === 'proposed');

  expect(notices).toStrictEqual([
    {
      noticeKey: `turn/conversation/${String(sequence)}`,
      thread: 'conversation',
      remembered: 1,
      retired: 0,
      proposed: 1,
      entries: [
        {
          itemID: applied.itemID,
          change: 'created',
          version: 1,
          proposalID: null,
          sequence: expect.toBeNumber(),
        },
        {
          itemID: expect.toBeString(),
          change: 'proposed',
          version: null,
          proposalID: proposed.proposalID,
          sequence: expect.toBeNumber(),
        },
      ],
    },
  ]);
});

test("it merges a task's write into the conversation's pending proposal of the same text", async () => {
  const memory = await startTestMemory();

  const first = await memory.store.writes.remember({
    text: 'Collects vintage fountain pens.',
    caller: buildMockWriteCaller(),
  });

  const second = await memory.store.writes.remember({
    text: 'collects vintage  fountain pens',
    caller: buildMockWriteCaller({ origin: 'task', thread: 'task-7', taskID: 'task-7' }),
  });

  const pending = await memory.store.proposals.listPending();

  invariant(first.status === 'proposed');

  expect(second).toStrictEqual({
    status: 'proposed',
    proposalID: first.proposalID,
    reason: 'no_quote',
    merged: true,
  });

  expect(pending).toMatchObject([
    {
      proposalID: first.proposalID,
      text: 'Collects vintage fountain pens.',
      sources: [
        { origin: 'conversation', thread: 'conversation', taskID: 'conversation' },
        { origin: 'task', thread: 'task-7', taskID: 'task-7' },
      ],
    },
  ]);

  expect(pending).toHaveLength(1);
});

test("it shows the proposal a write merged into in the notice of the write's own task run", async () => {
  const memory = await startTestMemory();

  const first = await memory.store.writes.remember({
    text: 'Collects vintage fountain pens.',
    caller: buildMockWriteCaller(),
  });

  await memory.store.writes.remember({
    text: 'Collects vintage fountain pens.',
    caller: buildMockWriteCaller({ origin: 'task', thread: 'task-7', runID: 'run-7' }),
  });

  const notices = await memory.store.readNotices('task-7');

  invariant(first.status === 'proposed');

  expect(notices).toMatchObject([
    {
      noticeKey: 'run/run-7',
      proposed: 1,
      entries: [{ change: 'proposed', version: null, proposalID: first.proposalID }],
    },
  ]);
});

test("it merges a write past the turn's proposal cap, because a merge adds no proposal", async () => {
  const memory = await startTestMemory({
    gate: {
      limits: { evidenceWindow: 20, proposalLapseMs: 60_000, proposalCap: 1, closeMatchScore: 0.6 },
    },
  });

  await memory.store.writes.remember({ text: 'Fact one', caller: buildMockWriteCaller() });

  const again = await memory.store.writes.remember({
    text: 'Fact one',
    caller: buildMockWriteCaller(),
  });

  expect(again).toMatchObject({ status: 'proposed', merged: true });
});

test('it keeps the same text under another subject as a proposal of its own, and merges a write only into the proposal of its subject', async () => {
  const memory = await startTestMemory();

  const owner = await memory.store.writes.remember({
    text: 'Calls the garden shed the cabin',
    caller: buildMockWriteCaller(),
  });

  const shared = await memory.store.writes.remember({
    text: 'Calls the garden shed the cabin',
    subject: 'shared',
    caller: buildMockWriteCaller(),
  });

  const again = await memory.store.writes.remember({
    text: 'Calls the garden shed the cabin',
    subject: 'shared',
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  invariant(owner.status === 'proposed');
  invariant(shared.status === 'proposed');

  expect(shared.proposalID).not.toBe(owner.proposalID);

  expect(again).toStrictEqual({
    status: 'proposed',
    proposalID: shared.proposalID,
    reason: 'no_quote',
    merged: true,
  });

  expect(pending.map((proposal) => [proposal.proposalID, proposal.subject])).toStrictEqual([
    [owner.proposalID, 'owner'],
    [shared.proposalID, 'shared'],
  ]);
});

test('it keeps a reworded write as a proposal of its own', async () => {
  const memory = await startTestMemory();

  await memory.store.writes.remember({
    text: 'Collects vintage fountain pens.',
    caller: buildMockWriteCaller(),
  });

  const reworded = await memory.store.writes.remember({
    text: 'Collects old fountain pens.',
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  expect(reworded).toMatchObject({ status: 'proposed', merged: false });

  expect(pending.map((proposal) => proposal.text)).toStrictEqual([
    'Collects vintage fountain pens.',
    'Collects old fountain pens.',
  ]);
});

test('it moves a proposal lapse back to a full lapse window when a later write merges into it', async () => {
  const clock = buildTestClock(1_000_000);

  const memory = await startTestMemory({
    gate: {
      clock,
      limits: {
        evidenceWindow: 20,
        proposalLapseMs: 60_000,
        proposalCap: 10,
        closeMatchScore: 0.6,
      },
    },
  });

  await memory.store.writes.remember({ text: 'Fact one', caller: buildMockWriteCaller() });

  clock.advance(50_000);

  await memory.store.writes.remember({ text: 'Fact one', caller: buildMockWriteCaller() });

  const pending = await memory.store.proposals.listPending();

  expect(pending).toMatchObject([{ lapseAt: 1_110_000 }]);
});

test('it lists a proposal once in a turn notice when the turn proposes it twice', async () => {
  const memory = await startTestMemory();

  await memory.store.writes.remember({ text: 'Fact one', caller: buildMockWriteCaller() });
  await memory.store.writes.remember({ text: 'Fact one', caller: buildMockWriteCaller() });

  const notices = await memory.store.readNotices('conversation');

  expect(notices).toMatchObject([{ proposed: 1, entries: [{ change: 'proposed' }] }]);
  expect(notices[0]?.entries).toHaveLength(1);
});

test('it proposes a write from a photo that cites no quote with the photo reason, and saves nothing', async () => {
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

  const versions = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .selectAll()
    .execute();

  expect(outcome).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    reason: 'from_photo',
    merged: false,
  });

  expect(versions).toStrictEqual([]);
});

test('it proposes a write from a photo whose quote you typed, and keeps the quote out of the proposal', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer()));

  const memory = await startTestMemory({ gate: { check } });

  const photo = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I ride a green cargo bike',
    spans: [{ start: 0, end: 25, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const outcome = await memory.store.writes.remember({
    text: 'Rides a green cargo bike',
    quote: 'I ride a green cargo bike',
    eventID: photo,
    image: { messageSequence: photo, image: 1 },
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'from_photo' });
  expect(pending).toMatchObject([{ reason: 'from_photo', quote: null, evidence: null }]);
  expect(check).not.toHaveBeenCalled();
});

test('it names the photo and the token verdict in the checks of a proposal from a photo', async () => {
  const memory = await startTestMemory();

  const photo = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Look at this',
    spans: [{ start: 0, end: 12, source: 'typed' }],
    images: ['image/png', 'image/jpeg'],
  });

  const outcome = await memory.store.writes.remember({
    text: 'Owns a red kayak',
    image: { messageSequence: photo, image: 2 },
    caller: buildMockWriteCaller(),
  });

  invariant(outcome.status === 'proposed');

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select(['checks', 'source'])
    .where('proposal_id', '=', outcome.proposalID)
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({
    checks: JSON.stringify({ tokens: 'pass', image: { messageSequence: photo, image: 2 } }),
    source: 'untrusted',
  });
});

test('it merges a write from a photo into the pending proposal of the same text from the same photo', async () => {
  const memory = await startTestMemory();

  const photo = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Look at this',
    spans: [{ start: 0, end: 12, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const first = await memory.store.writes.remember({
    text: 'Rides a green cargo bike',
    image: { messageSequence: photo, image: 1 },
    caller: buildMockWriteCaller(),
  });

  const second = await memory.store.writes.remember({
    text: 'Rides a green cargo bike',
    image: { messageSequence: photo, image: 1 },
    caller: buildMockWriteCaller(),
  });

  invariant(first.status === 'proposed');

  expect(second).toStrictEqual({
    status: 'proposed',
    proposalID: first.proposalID,
    reason: 'from_photo',
    merged: true,
  });
});

test('it keeps writes of the same text from photos of 2 messages as proposals of their own', async () => {
  const memory = await startTestMemory();

  const [firstPhoto, secondPhoto] = await Promise.all(
    ['Look at this', 'And this one'].map((text) =>
      writeOwnerMessageRecord(memory.log, {
        thread: 'conversation',
        text,
        spans: [{ start: 0, end: text.length, source: 'typed' }],
        images: ['image/jpeg'],
      }),
    ),
  );

  invariant(firstPhoto !== undefined && secondPhoto !== undefined);

  await memory.store.writes.remember({
    text: 'Rides a green cargo bike',
    image: { messageSequence: firstPhoto, image: 1 },
    caller: buildMockWriteCaller(),
  });

  const outcome = await memory.store.writes.remember({
    text: 'Rides a green cargo bike',
    image: { messageSequence: secondPhoto, image: 1 },
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  expect(outcome).toMatchObject({ status: 'proposed', merged: false });
  expect(pending).toHaveLength(2);
});

test('it keeps writes of the same text from 2 images of one message as proposals of their own', async () => {
  const memory = await startTestMemory();

  const photo = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Look at these',
    spans: [{ start: 0, end: 13, source: 'typed' }],
    images: ['image/jpeg', 'image/png'],
  });

  await memory.store.writes.remember({
    text: 'Rides a green cargo bike',
    image: { messageSequence: photo, image: 1 },
    caller: buildMockWriteCaller(),
  });

  const outcome = await memory.store.writes.remember({
    text: 'Rides a green cargo bike',
    image: { messageSequence: photo, image: 2 },
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  expect(outcome).toMatchObject({ status: 'proposed', merged: false });
  expect(pending).toHaveLength(2);
});

test('it keeps a write from a photo as a proposal of its own beside a pending proposal of the same text', async () => {
  const memory = await startTestMemory();

  const photo = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Look at this',
    spans: [{ start: 0, end: 12, source: 'typed' }],
    images: ['image/jpeg'],
  });

  await memory.store.writes.remember({
    text: 'Rides a green cargo bike',
    caller: buildMockWriteCaller(),
  });

  const outcome = await memory.store.writes.remember({
    text: 'Rides a green cargo bike',
    image: { messageSequence: photo, image: 1 },
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'from_photo', merged: false });
  expect(pending).toMatchObject([{ reason: 'no_quote' }, { reason: 'from_photo' }]);
});

test('it leaves a write from a photo a proposal under your allow rule on memory.remember', async () => {
  const memory = await startTestMemory({
    gate: { findAllowRule: makeToolAllowRule('memory.remember') },
  });

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

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'from_photo' });
});

test('it applies a write from a photo under your allow rule that names the image source, with the photo as its source', async () => {
  const memory = await startTestMemory({
    gate: {
      findAllowRule: () => Promise.resolve({ ruleID: 'rule-photo', revision: 3, source: 'image' }),
    },
  });

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

  invariant(outcome.status === 'applied');

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .select(['source', 'checks', 'evidence'])
    .where('item_id', '=', outcome.itemID)
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({
    source: 'untrusted',
    checks: JSON.stringify({
      rule: { id: 'rule-photo', revision: 3 },
      tokens: 'pass',
      image: { messageSequence: photo, image: 1 },
    }),
    evidence: null,
  });
});

test('it proposes a write from a photo whose text holds a hidden character, under your allow rule that names the image source', async () => {
  const memory = await startTestMemory({
    gate: {
      findAllowRule: () => Promise.resolve({ ruleID: 'rule-photo', revision: 1, source: 'image' }),
    },
  });

  const photo = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Look at this',
    spans: [{ start: 0, end: 12, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const outcome = await memory.store.writes.remember({
    text: 'Rides a green​ cargo bike',
    image: { messageSequence: photo, image: 1 },
    caller: buildMockWriteCaller(),
  });

  const versions = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .selectAll()
    .execute();

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'invisible_character' });
  expect(versions).toStrictEqual([]);
});

test('it proposes a write from a photo with a number you never typed, under your allow rule that names the image source', async () => {
  const memory = await startTestMemory({
    gate: {
      findAllowRule: () => Promise.resolve({ ruleID: 'rule-photo', revision: 1, source: 'image' }),
    },
  });

  const photo = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Look at this',
    spans: [{ start: 0, end: 12, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const outcome = await memory.store.writes.remember({
    text: 'The bike shop phone number is 0412 555 019',
    image: { messageSequence: photo, image: 1 },
    caller: buildMockWriteCaller(),
  });

  const versions = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .selectAll()
    .execute();

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'token_missing' });
  expect(versions).toStrictEqual([]);
});

test('it refuses a photo source that names an image the message lacks', async () => {
  const memory = await startTestMemory();

  const photo = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Look at this',
    spans: [{ start: 0, end: 12, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const write = memory.store.writes.remember({
    text: 'Rides a green cargo bike',
    image: { messageSequence: photo, image: 2 },
    caller: buildMockWriteCaller(),
  });

  await write.catch(() => {});

  expect(write).rejects.toMatchObject({ code: 'IMAGE_SOURCE_REFUSED' });
});

test('it refuses a photo source in a message you forgot, and writes no proposal or version', async () => {
  const memory = await startTestMemory();

  const photo = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Look at this',
    spans: [{ start: 0, end: 12, source: 'typed' }],
    images: ['image/jpeg'],
  });

  await removeMessageKey(memory.log, photo);

  const write = memory.store.writes.remember({
    text: 'Rides a green cargo bike',
    image: { messageSequence: photo, image: 1 },
    caller: buildMockWriteCaller(),
  });

  await write.catch(() => {});

  const db = memory.writer.db.$extendTables<MemoryTables>();

  const proposals = await db.selectFrom('memory_proposals').selectAll().execute();
  const versions = await db.selectFrom('memory_versions').selectAll().execute();

  expect(write).rejects.toMatchObject({ code: 'IMAGE_SOURCE_REFUSED' });
  expect(proposals).toStrictEqual([]);
  expect(versions).toStrictEqual([]);
});

test('it refuses a photo source in a message of another thread', async () => {
  const memory = await startTestMemory();

  const photo = await writeOwnerMessageRecord(memory.log, {
    thread: 'task:other',
    text: 'Look at this',
    spans: [{ start: 0, end: 12, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const write = memory.store.writes.remember({
    text: 'Rides a green cargo bike',
    image: { messageSequence: photo, image: 1 },
    caller: buildMockWriteCaller({ thread: 'conversation' }),
  });

  await write.catch(() => {});

  expect(write).rejects.toMatchObject({ code: 'IMAGE_SOURCE_REFUSED' });
});

test('it refuses a photo source that names a message that is not yours', async () => {
  const memory = await startTestMemory();

  const reply = await writeModelReplyRecord(memory.log, {
    thread: 'conversation',
    text: 'Here is a picture',
  });

  const write = memory.store.writes.remember({
    text: 'Rides a green cargo bike',
    image: { messageSequence: reply, image: 1 },
    caller: buildMockWriteCaller(),
  });

  await write.catch(() => {});

  expect(write).rejects.toMatchObject({ code: 'IMAGE_SOURCE_REFUSED' });
});
