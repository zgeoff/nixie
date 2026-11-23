import { expect, mock, test } from 'bun:test';
import {
  buildSpanStateFromEvents,
  gboardPastedEvents,
  gboardTypedEvents,
} from '@heynixie/contract/test-utils';
import { writeRecords } from '@heynixie/log';
import { removeTestRecordKey } from '@heynixie/log/test-utils';
import { makeChecker } from '@heynixie/sessions';
import { makeGatedCall, waitForCondition } from '@heynixie/testing';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';
import {
  buildMockCheckerAnswer,
  buildMockWriteCaller,
  startTestMemory,
  writeModelReplyRecord,
} from '../test-utils';
import { buildAllowVerdict } from '../test-utils/build-allow-verdict';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { writeOwnerMessageRecord } from '../test-utils/write-owner-message-record';
import type { MemoryTables } from '../types';
import { SelfNoteError } from '../utils/error/self-note-error';
import { readVersion } from '../version/read-version';

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
      checker: {
        verdict: 'asserted',
        model: 'claude-sonnet-5-5',
        failure: null,
        snapshotHash: 'sha256:test',
      },
    }),
    model: 'claude-opus-5-5',
  });
});

test('it checks a write again under the definitions that a seed puts in force while the checker runs', async () => {
  const checker = makeGatedCall(() => buildMockCheckerAnswer({ model: 'claude-sonnet-5-5' }));
  const check = mock(checker.call);

  const inForce = {
    current: { snapshotHash: 'sha256:before', prompts: {} },
  };

  const memory = await startTestMemory({
    definitions: () => ({ snapshotHash: inForce.current.snapshotHash }),
    gate: { check, getPromptsInForce: () => inForce.current },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I sail on Sundays',
    spans: [{ start: 0, end: 17, source: 'typed' }],
  });

  const write = memory.store.writes.remember({
    text: 'Sails on Sundays',
    quote: 'I sail on Sundays',
    caller: buildMockWriteCaller(),
  });

  await checker.started;

  inForce.current = {
    snapshotHash: 'sha256:after',
    prompts: { 'content-checker': { parts: {}, template: 'Judge the claim strictly.' } },
  };

  checker.release();

  const outcome = await write;

  invariant(outcome.status === 'applied');

  expect(check).toHaveBeenCalledTimes(2);

  expect(check).toHaveBeenLastCalledWith({
    prompt: 'Judge the claim strictly.',
    input: expect.toEndWith('<candidate_memory>\nSails on Sundays\n</candidate_memory>'),
  });

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .select('checks')
    .where('item_id', '=', outcome.itemID)
    .executeTakeFirstOrThrow();

  expect(row.checks).toBe(
    JSON.stringify({
      quote: 'pass',
      tokens: 'pass',
      checker: {
        verdict: 'asserted',
        model: 'claude-sonnet-5-5',
        failure: null,
        snapshotHash: 'sha256:after',
      },
    }),
  );
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

test('it proposes a write whose gist holds a hidden character with the invisible character reason', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer()));

  const memory = await startTestMemory({ gate: { check } });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'The piano is tuned each March',
    spans: [{ start: 0, end: 29, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'The piano is tuned each March',
    quote: 'The piano is tuned each March',
    labels: { gist: 'piano​tuning', topic: 'home', triggers: [] },
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'invisible_character' });
});

test('it proposes a write whose trigger phrase holds a link its quote lacks with the token reason', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer()));

  const memory = await startTestMemory({ gate: { check } });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'The piano is tuned each March',
    spans: [{ start: 0, end: 29, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'The piano is tuned each March',
    quote: 'The piano is tuned each March',
    labels: {
      gist: 'piano tuned each March',
      topic: 'home',
      triggers: ['book at https://tuner.example/book'],
    },
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'token_missing' });
});

test('it applies a write whose labels and text pass with a typed quote, and gives the checker no label', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer()));

  const memory = await startTestMemory({ gate: { check } });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'The piano is tuned each March',
    spans: [{ start: 0, end: 29, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'The piano is tuned each March',
    quote: 'The piano is tuned each March',
    labels: { gist: 'yearly tuning visit', topic: 'household', triggers: ['tuner'] },
    caller: buildMockWriteCaller(),
  });

  const sent = JSON.stringify(check.mock.calls);

  expect(outcome).toMatchObject({ status: 'applied' });
  expect(check).toHaveBeenCalledTimes(1);

  expect(['yearly tuning visit', 'household', 'tuner']).toSatisfyAll(
    (label: string) => !sent.includes(label),
  );
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
  const clock = createFakeClock({ startMs: 1_700_000_000_000 });

  const memory = await startTestMemory({
    gate: {
      check: makeChecker({
        ask: () => Promise.withResolvers<never>().promise,
        model: 'claude-sonnet-5-5',
        clock,
        timeoutMs: 1000,
      }),
    },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  const outcomeWait = memory.store.writes.remember({
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
    caller: buildMockWriteCaller(),
  });

  // the checker's timeout waits on the test clock, and the memory's own work between the writes
  // takes real time, so the test waits in real time for the timeout to start
  await waitForCondition(() => clock.countPending() > 0);

  clock.advance(1000);

  const outcome = await outcomeWait;

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'checker_unreachable' });
});

test('it gives the checker your one message with when and where you sent it, and the memory text', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer()));

  const memory = await startTestMemory({
    gate: { check },
    logClock: createFakeClock({ startMs: Date.parse('2026-10-19T08:14:00Z') }),
  });

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
    timeZone: 'Europe/London',
  });

  await memory.store.writes.remember({
    text: 'Phone number is 0400 000 002',
    quote: 'My new number is 0400 000 002',
    caller: buildMockWriteCaller(),
  });

  expect(check).toHaveBeenCalledExactlyOnceWith({
    prompt: expect.toStartWith('You check one candidate memory'),
    input:
      '<sent>Mon 19 Oct 2026, 09:14, Europe/London (UTC+01:00)</sent>\n\n' +
      '<owner_message>\n' +
      '«evidence»My new number is 0400 000 002«/evidence», the old one is gone: «pasted»see screenshot«/pasted»\n' +
      '</owner_message>\n\n' +
      '<candidate_memory>\nPhone number is 0400 000 002\n</candidate_memory>',
  });
});

test('it gives the checker the content checker prompt override in force', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer()));

  const memory = await startTestMemory({
    gate: {
      check,
      getPromptsInForce: () => ({
        snapshotHash: 'sha256:test',
        prompts: {
          'content-checker': { parts: {}, template: 'Judge what {{ owner.name }} asserted.' },
        },
      }),
    },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I keep two hens',
    spans: [{ start: 0, end: 15, source: 'typed' }],
  });

  await memory.store.writes.remember({
    text: 'Keeps two hens',
    quote: 'I keep two hens',
    caller: buildMockWriteCaller(),
  });

  expect(check).toHaveBeenCalledExactlyOnceWith({
    prompt: 'Judge what the owner asserted.',
    input: expect.toEndWith('<candidate_memory>\nKeeps two hens\n</candidate_memory>'),
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

test("it proposes a write whose quote lies in a task message, cited by its event ID, as never the owner's words", async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer()));

  const memory = await startTestMemory({ gate: { check } });

  const [message] = await writeRecords(memory.log, [
    {
      kind: 'task_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        messageID: 'k3vq8m2xpa',
        from: 'task-1',
        to: 'conversation',
        kind: 'report',
        replyTo: null,
        onBehalfOf: [],
        hop: 1,
        hopLimit: 20,
        wake: true,
        woke: true,
        source: 'task:task-1',
      },
      erasable: { body: 'The owner said: I take my coffee black' },
    },
  ]);

  invariant(message);

  const outcome = await memory.store.writes.remember({
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
    eventID: message.sequence,
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'quote_not_typed' });
  expect(check).not.toHaveBeenCalled();
});

test("it proposes a write whose quote lies only in a task message in the thread, as never the owner's words", async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer()));

  const memory = await startTestMemory({ gate: { check } });

  await writeRecords(memory.log, [
    {
      kind: 'task_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        messageID: 'k3vq8m2xpa',
        from: 'task-1',
        to: 'conversation',
        kind: 'report',
        replyTo: null,
        onBehalfOf: [],
        hop: 1,
        hopLimit: 20,
        wake: true,
        woke: true,
        source: 'task:task-1',
      },
      erasable: { body: 'I take my coffee black' },
    },
  ]);

  const outcome = await memory.store.writes.remember({
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'no_quote' });
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

test('it applies a write with an end time at once when the checker confirms its time limit, and shows the checker that end time', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })));

  const memory = await startTestMemory({
    gate: { check, clock: createFakeClock({ startMs: Date.parse('2026-10-19T08:30:00Z') }) },
    logClock: createFakeClock({ startMs: Date.parse('2026-10-19T08:14:00Z') }),
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: "I'm in Lisbon this week",
    spans: [{ start: 0, end: 23, source: 'typed' }],
    timeZone: 'Europe/Lisbon',
  });

  const outcome = await memory.store.writes.remember({
    text: 'Is in Lisbon this week',
    quote: "I'm in Lisbon this week",
    until: Date.parse('2026-10-25T23:59:59Z'),
    caller: buildMockWriteCaller(),
  });

  invariant(outcome.status === 'applied');

  const item = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('until')
    .where('item_id', '=', outcome.itemID)
    .executeTakeFirstOrThrow();

  expect(item.until).toBe(Date.parse('2026-10-25T23:59:59Z'));

  expect(check).toHaveBeenCalledExactlyOnceWith({
    prompt: expect.toStartWith('You check one candidate memory'),
    input:
      '<sent>Mon 19 Oct 2026, 09:14, Europe/Lisbon (UTC+01:00)</sent>\n\n' +
      "<owner_message>\n«evidence»I'm in Lisbon this week«/evidence»\n</owner_message>\n\n" +
      '<candidate_memory>\nIs in Lisbon this week\n</candidate_memory>\n\n' +
      '<end_time>Sun 25 Oct 2026, 23:59, Europe/Lisbon (UTC+00:00)</end_time>',
  });
});

test('it proposes a write with an end time that the checker does not confirm, and the proposal keeps the end time', async () => {
  const memory = await startTestMemory({
    gate: {
      check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'not_asserted' })),
      clock: createFakeClock({ startMs: Date.parse('2026-10-19T08:30:00Z') }),
    },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I live in Lisbon',
    spans: [{ start: 0, end: 16, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'Lives in Lisbon',
    quote: 'I live in Lisbon',
    until: Date.parse('2026-10-25T23:59:59Z'),
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'checker_not_asserted' });

  expect(pending).toMatchObject([
    { text: 'Lives in Lisbon', until: Date.parse('2026-10-25T23:59:59Z') },
  ]);
});

test('it lapses a proposal at its end time when that comes before the lapse window ends', async () => {
  const memory = await startTestMemory({
    gate: { clock: createFakeClock({ startMs: Date.parse('2026-10-19T08:30:00Z') }) },
  });

  await memory.store.writes.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-25T23:59:59Z'),
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  expect(pending).toMatchObject([{ lapseAt: Date.parse('2026-10-25T23:59:59Z') }]);
});

test('it keeps a merged proposal lapsing at its end time when a fresh lapse window would end later', async () => {
  const clock = createFakeClock({ startMs: Date.parse('2026-10-19T08:30:00Z') });

  const memory = await startTestMemory({ gate: { clock } });

  await memory.store.writes.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-25T23:59:59Z'),
    caller: buildMockWriteCaller(),
  });

  clock.advance(3_600_000);

  const outcome = await memory.store.writes.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-25T23:59:59Z'),
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  expect(outcome).toMatchObject({ status: 'proposed', merged: true });
  expect(pending).toMatchObject([{ lapseAt: Date.parse('2026-10-25T23:59:59Z') }]);
});

test('it refuses a write whose end time has passed, before any check runs and with no proposal', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer()));

  const memory = await startTestMemory({
    gate: { check, clock: createFakeClock({ startMs: Date.parse('2026-10-26T08:30:00Z') }) },
  });

  const write = memory.store.writes.remember({
    text: 'Is in Lisbon this week',
    quote: "I'm in Lisbon this week",
    until: Date.parse('2026-10-25T23:59:59Z'),
    caller: buildMockWriteCaller(),
  });

  await write.catch(() => {});

  const pending = await memory.store.proposals.listPending();

  expect(write).rejects.toMatchObject({ code: 'UNTIL_PASSED' });
  expect(check).not.toHaveBeenCalled();
  expect(pending).toStrictEqual([]);
});

test('it proposes an edit that adds an end time without a quote that backs it', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer()));

  const memory = await startTestMemory({
    gate: { check, clock: createFakeClock({ startMs: Date.parse('2026-10-19T08:30:00Z') }) },
  });

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const outcome = await memory.store.writes.remember({
    text: 'Lives on Elm Street',
    target: item,
    until: Date.parse('2026-10-25T23:59:59Z'),
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'no_quote' });

  expect(pending).toMatchObject([
    { itemID: item.itemID, targetVersion: 1, until: Date.parse('2026-10-25T23:59:59Z') },
  ]);

  expect(check).not.toHaveBeenCalled();
});

test('it keeps the end time of an item that an edit without an end time rewrites', async () => {
  const memory = await startTestMemory({
    gate: {
      check: () => Promise.resolve(buildMockCheckerAnswer()),
      clock: createFakeClock({ startMs: Date.parse('2026-10-19T08:30:00Z') }),
    },
  });

  const item = await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-25T23:59:59Z'),
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: "Actually it's Porto this week, not Lisbon",
    spans: [{ start: 0, end: 41, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'Is in Porto this week',
    quote: "Actually it's Porto this week",
    target: item,
    caller: buildMockWriteCaller(),
  });

  invariant(outcome.status === 'applied');

  const version = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .select('until')
    .where('item_id', '=', item.itemID)
    .where('version', '=', outcome.version)
    .executeTakeFirstOrThrow();

  expect(version.until).toBe(Date.parse('2026-10-25T23:59:59Z'));
});

test('it keeps the end time of an item on the proposal of an edit without an end time', async () => {
  const memory = await startTestMemory({
    gate: { clock: createFakeClock({ startMs: Date.parse('2026-10-19T08:30:00Z') }) },
  });

  const item = await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-25T23:59:59Z'),
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.writes.remember({
    text: 'Is in Porto this week',
    target: item,
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  expect(pending).toMatchObject([
    { itemID: item.itemID, targetVersion: 1, until: Date.parse('2026-10-25T23:59:59Z') },
  ]);
});

test('it clears the end time of an item that an edit with a null end time rewrites', async () => {
  const memory = await startTestMemory({
    gate: {
      check: () => Promise.resolve(buildMockCheckerAnswer()),
      clock: createFakeClock({ startMs: Date.parse('2026-10-19T08:30:00Z') }),
    },
  });

  const item = await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-25T23:59:59Z'),
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: "Actually I'm staying in Lisbon for good",
    spans: [{ start: 0, end: 39, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'Lives in Lisbon',
    quote: "I'm staying in Lisbon for good",
    target: item,
    until: null,
    caller: buildMockWriteCaller(),
  });

  invariant(outcome.status === 'applied');

  const version = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .select('until')
    .where('item_id', '=', item.itemID)
    .where('version', '=', outcome.version)
    .executeTakeFirstOrThrow();

  expect(version.until).toBeNull();
});

test('it keeps writes of the same text with different end times as proposals of their own', async () => {
  const memory = await startTestMemory({
    gate: { clock: createFakeClock({ startMs: Date.parse('2026-10-19T08:30:00Z') }) },
  });

  await memory.store.writes.remember({
    text: 'Is in Lisbon',
    until: Date.parse('2026-10-25T23:59:59Z'),
    caller: buildMockWriteCaller(),
  });

  await memory.store.writes.remember({
    text: 'Is in Lisbon',
    until: Date.parse('2026-11-01T23:59:59Z'),
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  expect(pending.map((proposal) => proposal.until)).toStrictEqual([
    Date.parse('2026-10-25T23:59:59Z'),
    Date.parse('2026-11-01T23:59:59Z'),
  ]);
});

test('it applies a write under your allow rule with outside content as its source', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer({ verdict: 'not_asserted' })));

  const memory = await startTestMemory({ gate: { check } });

  const outcome = await memory.store.writes.remember({
    text: 'Likes jazz',
    caller: buildMockWriteCaller(),
    verdict: buildAllowVerdict(),
  });

  invariant(outcome.status === 'applied');

  const history = await memory.store.readHistory(outcome.itemID);

  expect(history?.versions).toMatchObject([{ source: 'untrusted', origin: 'conversation' }]);
  expect(check).not.toHaveBeenCalled();
});

test('it applies a write under your allow rule whose token you never typed, because the rule is your consent', async () => {
  const memory = await startTestMemory();

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Write to me at sam@example.com',
    spans: [{ start: 0, end: 30, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'Email is sam@attacker.example',
    caller: buildMockWriteCaller(),
    verdict: buildAllowVerdict(),
  });

  expect(outcome).toMatchObject({ status: 'applied' });
});

test('it proposes a write under an ask rule with the review reason ask_rule and the rule in its checks', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer()));

  const memory = await startTestMemory({ gate: { check } });

  const outcome = await memory.store.writes.remember({
    text: 'Likes jazz',
    caller: buildMockWriteCaller(),
    verdict: { kind: 'rule-ask', rule: { id: 'rule-b', revision: 4 } },
  });

  const [proposal] = await memory.store.proposals.listPending();

  invariant(proposal);

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select(['review_reason', 'checks', 'source'])
    .where('proposal_id', '=', proposal.proposalID)
    .executeTakeFirstOrThrow();

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'ask_rule' });

  expect(row).toStrictEqual({
    review_reason: 'ask_rule',
    checks: JSON.stringify({ rule: { id: 'rule-b', revision: 4 } }),
    source: 'untrusted',
  });

  expect(check).not.toHaveBeenCalled();
});

test('it runs every check on a write whose verdict is gate', async () => {
  const memory = await startTestMemory();

  const outcome = await memory.store.writes.remember({
    text: 'Likes jazz',
    caller: buildMockWriteCaller(),
    verdict: { kind: 'gate' },
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'no_quote' });
});

test('it leaves a self-note a proposal under an allow rule that checks no subject', async () => {
  const memory = await startTestMemory();

  const outcome = await memory.store.writes.remember({
    text: 'I like quiet mornings',
    subject: 'self',
    caller: buildMockWriteCaller(),
    verdict: buildAllowVerdict(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'self_note' });
});

test('it applies a self-note under an allow rule that checks the subject is self, with the rule in its checks', async () => {
  const memory = await startTestMemory();

  const outcome = await memory.store.writes.remember({
    text: 'I like quiet mornings',
    subject: 'self',
    caller: buildMockWriteCaller(),
    verdict: buildAllowVerdict([{ arg: 'subject', op: 'eq', value: 'self' }]),
  });

  invariant(outcome.status === 'applied');

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .select(['checks'])
    .where('item_id', '=', outcome.itemID)
    .executeTakeFirstOrThrow();

  expect(row.checks).toBe(JSON.stringify({ rule: { id: 'rule-a', revision: 2 } }));
});

test('it applies a self-note with a token you never typed under an allow rule that checks the subject is self', async () => {
  const memory = await startTestMemory();

  const outcome = await memory.store.writes.remember({
    text: 'Reach me at sam@attacker.example',
    subject: 'self',
    caller: buildMockWriteCaller(),
    verdict: buildAllowVerdict([{ arg: 'subject', op: 'eq', value: 'self' }]),
  });

  expect(outcome).toMatchObject({ status: 'applied' });
});

test('it counts a self-note as covered when one of several allow rules checks the subject', async () => {
  const memory = await startTestMemory();

  const outcome = await memory.store.writes.remember({
    text: 'I like quiet mornings',
    subject: 'self',
    caller: buildMockWriteCaller(),
    verdict: {
      kind: 'rule-allow',
      rules: [
        { id: 'rule-a', revision: 1, checks: [] },
        { id: 'rule-b', revision: 5, checks: [{ arg: 'subject', op: 'eq', value: 'self' }] },
      ],
    },
  });

  invariant(outcome.status === 'applied');

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .select(['checks'])
    .where('item_id', '=', outcome.itemID)
    .executeTakeFirstOrThrow();

  expect(row.checks).toBe(JSON.stringify({ rule: { id: 'rule-b', revision: 5 } }));
});

test('it leaves a self-note from a photo a proposal when no allow rule checks the image, though one checks the subject', async () => {
  const memory = await startTestMemory();

  const photo = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Look at this',
    spans: [{ start: 0, end: 12, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const outcome = await memory.store.writes.remember({
    text: 'I liked how the bike looked',
    subject: 'self',
    image: { messageSequence: photo, image: 1 },
    caller: buildMockWriteCaller(),
    verdict: {
      kind: 'rule-allow',
      rules: [{ id: 'rule-a', revision: 1, checks: [{ arg: 'subject', op: 'eq', value: 'self' }] }],
    },
  });

  expect(outcome).toMatchObject({ status: 'proposed' });
});

test('it leaves a self-note from a photo a proposal when the subject and the image are checked by separate allow rules', async () => {
  const memory = await startTestMemory();

  const photo = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Look at this',
    spans: [{ start: 0, end: 12, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const outcome = await memory.store.writes.remember({
    text: 'I liked how the bike looked',
    subject: 'self',
    image: { messageSequence: photo, image: 1 },
    caller: buildMockWriteCaller(),
    verdict: {
      kind: 'rule-allow',
      rules: [
        { id: 'rule-a', revision: 1, checks: [{ arg: 'subject', op: 'eq', value: 'self' }] },
        { id: 'rule-b', revision: 2, checks: [{ arg: 'image.number', op: 'eq', value: 1 }] },
      ],
    },
  });

  expect(outcome).toMatchObject({ status: 'proposed' });
});

test('it applies a self-note from a photo when one allow rule checks both the subject and the image', async () => {
  const memory = await startTestMemory();

  const photo = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Look at this',
    spans: [{ start: 0, end: 12, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const outcome = await memory.store.writes.remember({
    text: 'I liked how the bike looked',
    subject: 'self',
    image: { messageSequence: photo, image: 1 },
    caller: buildMockWriteCaller(),
    verdict: {
      kind: 'rule-allow',
      rules: [
        {
          id: 'rule-a',
          revision: 1,
          checks: [
            { arg: 'subject', op: 'eq', value: 'self' },
            { arg: 'image.number', op: 'eq', value: 1 },
          ],
        },
      ],
    },
  });

  expect(outcome).toMatchObject({ status: 'applied' });
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

test('it keeps an edit that moves its item to another subject apart from the same edit that keeps the subject, and merges a write only into the proposal of its move', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Calls the garden shed the cabin',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const kept = await memory.store.writes.remember({
    text: 'Calls the garden shed the cabin, and the assistant does too',
    target: item,
    caller: buildMockWriteCaller(),
  });

  const moved = await memory.store.writes.remember({
    text: 'Calls the garden shed the cabin, and the assistant does too',
    target: item,
    subject: 'shared',
    caller: buildMockWriteCaller(),
  });

  const again = await memory.store.writes.remember({
    text: 'Calls the garden shed the cabin, and the assistant does too',
    target: item,
    subject: 'shared',
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  invariant(kept.status === 'proposed');
  invariant(moved.status === 'proposed');

  expect(moved.proposalID).not.toBe(kept.proposalID);

  expect(again).toStrictEqual({
    status: 'proposed',
    proposalID: moved.proposalID,
    reason: 'no_quote',
    merged: true,
  });

  expect(pending.map((proposal) => [proposal.proposalID, proposal.newSubject])).toStrictEqual([
    [kept.proposalID, null],
    [moved.proposalID, 'shared'],
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
  const clock = createFakeClock({ startMs: 1_000_000 });

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

test('it leaves a write from a photo a proposal under an allow rule that checks no image argument', async () => {
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
    verdict: buildAllowVerdict(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'from_photo' });
});

test('it applies a write from a photo under your allow rule that checks the image argument, with the photo as its source', async () => {
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
    verdict: buildAllowVerdict([{ arg: 'image.eventID', op: 'matches', value: '*' }]),
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
      rule: { id: 'rule-a', revision: 2 },
      image: { messageSequence: photo, image: 1 },
    }),
    evidence: null,
  });
});

test('it proposes a write from a photo whose text holds a hidden character, under your allow rule that checks the image argument', async () => {
  const memory = await startTestMemory();

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
    verdict: buildAllowVerdict([{ arg: 'image.eventID', op: 'matches', value: '*' }]),
  });

  const versions = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .selectAll()
    .execute();

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'invisible_character' });
  expect(versions).toStrictEqual([]);
});

test('it applies a write from a photo with a number you never typed, under your allow rule that checks the image argument', async () => {
  const memory = await startTestMemory();

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
    verdict: buildAllowVerdict([{ arg: 'image.eventID', op: 'matches', value: '*' }]),
  });

  const versions = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .selectAll()
    .execute();

  expect(outcome).toMatchObject({ status: 'applied' });
  expect(versions).toHaveLength(1);
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

  await removeTestRecordKey(memory.log, photo);

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

test("it reads a cited event on the caller's log thread", async () => {
  const memory = await startTestMemory({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer()) },
  });

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
    eventID: sequence,
    caller: buildMockWriteCaller({ origin: 'task', thread: 'task-4', logThread: 'conversation' }),
  });

  expect(outcome).toStrictEqual({
    status: 'applied',
    itemID: expect.toBeString(),
    version: 1,
  });
});

test("it reads the quote window of a write on the caller's own thread, not its log thread", async () => {
  const memory = await startTestMemory({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer()) },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
    caller: buildMockWriteCaller({ origin: 'task', thread: 'task-4', logThread: 'conversation' }),
  });

  expect(outcome).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    merged: false,
    reason: 'no_quote',
  });
});

test.each([
  { from: 'conversation', caller: buildMockWriteCaller(), thread: 'conversation' },
  {
    from: 'task',
    caller: buildMockWriteCaller({ origin: 'task', thread: 'task-1', taskID: 'task-1' }),
    thread: 'task-1',
  },
] as const)(
  'it applies a text edit at once with a notice under a covering rule, from the $from',
  async (testCase) => {
    const memory = await startTestMemory();

    const item = await memory.store.remember({
      text: 'Keeps a kettlebell by the door',
      labels: { gist: 'kettlebell', topic: 'home', triggers: [] },
      provenance: buildMockProvenance(),
    });

    const outcome = await memory.store.writes.remember({
      text: 'Keeps two kettlebells by the door',
      target: item,
      verdict: buildAllowVerdict(),
      caller: testCase.caller,
    });

    const notices = await memory.store.readNotices(testCase.thread);

    expect(outcome).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 2 });

    expect(notices.flatMap((notice) => notice.entries)).toMatchObject([
      { itemID: item.itemID, change: 'edited', version: 2 },
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
  'it applies a subject change at once with a notice under a covering rule, from the $from',
  async (testCase) => {
    const memory = await startTestMemory();

    const item = await memory.store.remember({
      text: 'Keeps a kettlebell by the door',
      labels: { gist: 'kettlebell', topic: 'home', triggers: [] },
      provenance: buildMockProvenance(),
    });

    const outcome = await memory.store.writes.remember({
      text: 'Keeps a kettlebell by the door, and we share it',
      subject: 'shared',
      target: item,
      verdict: buildAllowVerdict(),
      caller: testCase.caller,
    });

    const subject = await memory.store.writes.readItemSubject(item.itemID);
    const notices = await memory.store.readNotices(testCase.thread);

    expect(outcome).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 2 });
    expect(subject).toBe('shared');

    expect(notices.flatMap((notice) => notice.entries)).toMatchObject([
      { itemID: item.itemID, change: 'edited', version: 2 },
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
  'it applies a new self-note at once with a notice under a rule that checks subject is self, from the $from',
  async (testCase) => {
    const memory = await startTestMemory();

    const outcome = await memory.store.writes.remember({
      text: 'I like opening with a question',
      subject: 'self',
      caller: testCase.caller,
      verdict: buildAllowVerdict([{ arg: 'subject', op: 'eq', value: 'self' }]),
    });

    const notices = await memory.store.readNotices(testCase.thread);

    expect(outcome).toMatchObject({ status: 'applied', version: 1 });

    expect(notices.flatMap((notice) => notice.entries)).toMatchObject([
      { change: 'created', version: 1 },
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
  'it applies a self-note edit at once with a notice under a rule that checks subject is self, from the $from',
  async (testCase) => {
    const memory = await startTestMemory();

    const item = await memory.store.remember({
      text: 'Keeps a kettlebell by the door',
      labels: { gist: 'kettlebell', topic: 'home', triggers: [] },
      subject: 'self',
      provenance: buildMockProvenance(),
    });

    const outcome = await memory.store.writes.remember({
      text: 'I like opening with a question about the weekend',
      target: item,
      verdict: buildAllowVerdict([{ arg: 'subject', op: 'eq', value: 'self' }]),
      caller: testCase.caller,
    });

    const notices = await memory.store.readNotices(testCase.thread);

    expect(outcome).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 2 });

    expect(notices.flatMap((notice) => notice.entries)).toMatchObject([
      { itemID: item.itemID, change: 'edited', version: 2 },
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
  'it moves an item into self at once with a notice under a rule that checks subject is self, from the $from',
  async (testCase) => {
    const memory = await startTestMemory();

    const item = await memory.store.remember({
      text: 'Keeps a kettlebell by the door',
      labels: { gist: 'kettlebell', topic: 'home', triggers: [] },
      provenance: buildMockProvenance(),
    });

    const outcome = await memory.store.writes.remember({
      text: 'I keep a kettlebell by the door',
      subject: 'self',
      target: item,
      verdict: buildAllowVerdict([{ arg: 'subject', op: 'eq', value: 'self' }]),
      caller: testCase.caller,
    });

    const subject = await memory.store.writes.readItemSubject(item.itemID);
    const notices = await memory.store.readNotices(testCase.thread);

    expect(outcome).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 2 });
    expect(subject).toBe('self');

    expect(notices.flatMap((notice) => notice.entries)).toMatchObject([
      { itemID: item.itemID, change: 'edited', version: 2 },
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
  'it moves an item out of self at once with a notice under a covering rule, from the $from',
  async (testCase) => {
    const memory = await startTestMemory();

    const item = await memory.store.remember({
      text: 'Keeps a kettlebell by the door',
      labels: { gist: 'kettlebell', topic: 'home', triggers: [] },
      subject: 'self',
      provenance: buildMockProvenance(),
    });

    const outcome = await memory.store.writes.remember({
      text: 'Keeps a kettlebell by the door',
      subject: 'owner',
      target: item,
      verdict: buildAllowVerdict(),
      caller: testCase.caller,
    });

    const subject = await memory.store.writes.readItemSubject(item.itemID);
    const notices = await memory.store.readNotices(testCase.thread);

    expect(outcome).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 2 });
    expect(subject).toBe('owner');

    expect(notices.flatMap((notice) => notice.entries)).toMatchObject([
      { itemID: item.itemID, change: 'edited', version: 2 },
    ]);
  },
);

test('it makes a text write with a hidden character a proposal under a covering rule', async () => {
  const memory = await startTestMemory();

  const outcome = await memory.store.writes.remember({
    text: 'Keeps a kettle\u200Bbell by the door',
    caller: buildMockWriteCaller(),
    verdict: buildAllowVerdict(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'invisible_character' });
});

test("it fails a task's self-note write when no rule covers it", async () => {
  const memory = await startTestMemory();

  const write = memory.store.writes.remember({
    text: 'I like opening with a question',
    subject: 'self',
    caller: buildMockWriteCaller({ origin: 'task', thread: 'task-1', taskID: 'task-1' }),
    verdict: { kind: 'gate' },
  });

  expect(write).rejects.toThrow('only the conversation writes a self-note');
});

test("it fails a task's self-note write under a rule that checks no subject", async () => {
  const memory = await startTestMemory();

  const write = memory.store.writes.remember({
    text: 'I like opening with a question',
    subject: 'self',
    caller: buildMockWriteCaller({ origin: 'task', thread: 'task-1', taskID: 'task-1' }),
    verdict: buildAllowVerdict(),
  });

  expect(write).rejects.toThrow('only the conversation writes a self-note');
});

test("it fails a task's self-note write under an ask rule", async () => {
  const memory = await startTestMemory();

  const write = memory.store.writes.remember({
    text: 'I like opening with a question',
    subject: 'self',
    caller: buildMockWriteCaller({ origin: 'task', thread: 'task-1', taskID: 'task-1' }),
    verdict: { kind: 'rule-ask', rule: { id: 'rule-b', revision: 3 } },
  });

  expect(write).rejects.toThrow('only the conversation writes a self-note');
});

test('it holds a granted task self-note for review, as it holds the conversation one', async () => {
  const memory = await startTestMemory();

  const outcome = await memory.store.writes.remember({
    text: 'I like quiet mornings',
    subject: 'self',
    caller: buildMockWriteCaller({
      origin: 'task',
      thread: 'task-1',
      taskID: 'task-1',
      hasSelfNoteGrant: true,
    }),
    verdict: { kind: 'gate' },
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'self_note' });
});

test('it applies a granted task self-note under a rule that checks the subject is self', async () => {
  const memory = await startTestMemory();

  const outcome = await memory.store.writes.remember({
    text: 'I like quiet mornings',
    subject: 'self',
    caller: buildMockWriteCaller({
      origin: 'task',
      thread: 'task-1',
      taskID: 'task-1',
      hasSelfNoteGrant: true,
    }),
    verdict: buildAllowVerdict([{ arg: 'subject', op: 'eq', value: 'self' }]),
  });

  expect(outcome).toMatchObject({ status: 'applied', version: 1 });
});

test('it holds a granted task self-note text edit for review, and its approval stores the new text', async () => {
  const memory = await startTestMemory();

  const note = await memory.store.remember({
    text: 'I like quiet mornings',
    subject: 'self',
    provenance: buildMockProvenance(),
  });

  const outcome = await memory.store.writes.remember({
    text: 'I like quiet early mornings',
    target: note,
    caller: buildMockWriteCaller({
      origin: 'task',
      thread: 'task-1',
      taskID: 'task-1',
      hasSelfNoteGrant: true,
    }),
    verdict: { kind: 'gate' },
  });

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  const approved = await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  invariant(approved.status === 'applied');

  const stored = await readVersion(memory.log, memory.writer.db, approved);

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'self_note' });
  expect(stored.text.text).toBe('I like quiet early mornings');
});

test('it refuses a task with no grant a self-note text write', async () => {
  const memory = await startTestMemory();

  const note = await memory.store.remember({
    text: 'I like tidy lists',
    subject: 'self',
    provenance: buildMockProvenance(),
  });

  const write = memory.store.writes.remember({
    text: 'I like tidy dated lists',
    target: note,
    caller: buildMockWriteCaller({ origin: 'task', thread: 'task-1', taskID: 'task-1' }),
    verdict: { kind: 'gate' },
  });

  expect(write).rejects.toThrowWithMessage(
    SelfNoteError,
    'only the conversation writes a self-note, and this write came from the task',
  );
});

test('it approves a granted task self-note as a new item beside an owner item and a shared item with the same text', async () => {
  const memory = await startTestMemory();

  const owner = await memory.store.remember({
    text: 'Likes quiet mornings and tidy lists',
    subject: 'owner',
    provenance: buildMockProvenance(),
  });

  const shared = await memory.store.remember({
    text: 'Likes quiet mornings and tidy lists',
    subject: 'shared',
    provenance: buildMockProvenance(),
  });

  const proposed = await memory.store.writes.remember({
    text: 'Likes quiet mornings and tidy lists',
    subject: 'self',
    caller: buildMockWriteCaller({
      origin: 'task',
      thread: 'task-1',
      taskID: 'task-1',
      hasSelfNoteGrant: true,
    }),
    verdict: { kind: 'gate' },
  });

  invariant(proposed.status === 'proposed');

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  const approved = await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  invariant(approved.status === 'applied');

  const recalled = await memory.store.recall({
    itemIDs: [owner.itemID, shared.itemID, approved.itemID],
    thread: 'task-1',
  });

  expect(approved.itemID).not.toBeOneOf([owner.itemID, shared.itemID]);

  expect(
    recalled.items.map((entry) => [entry.itemID, entry.subject, entry.revision]),
  ).toIncludeSameMembers([
    [owner.itemID, 'owner', 1],
    [shared.itemID, 'shared', 1],
    [approved.itemID, 'self', 1],
  ]);
});

test.each([
  { name: 'a granted task', hasSelfNoteGrant: true },
  { name: 'a task with no grant', hasSelfNoteGrant: false },
])(
  'it holds an owner remember of $name for review, under the rules of a task',
  async (testCase) => {
    const memory = await startTestMemory();

    const outcome = await memory.store.writes.remember({
      text: 'Lives on Elm Street',
      subject: 'owner',
      caller: buildMockWriteCaller({
        origin: 'task',
        thread: 'task-1',
        taskID: 'task-1',
        hasSelfNoteGrant: testCase.hasSelfNoteGrant,
      }),
      verdict: { kind: 'gate' },
    });

    expect(outcome).toMatchObject({ status: 'proposed' });
  },
);

test('it refuses a write to an owner item through a tool that only the grant gives a task', async () => {
  const memory = await startTestMemory();

  const write = memory.store.writes.remember({
    text: 'Lives on Elm Street',
    subject: 'owner',
    caller: buildMockWriteCaller({
      origin: 'task',
      thread: 'task-1',
      taskID: 'task-1',
      hasSelfNoteGrant: true,
      isSelfNoteOnly: true,
    }),
    verdict: { kind: 'gate' },
  });

  expect(write).rejects.toThrow(SelfNoteError);
});

test('it holds a self-note from a tool that only the grant gives a task for review', async () => {
  const memory = await startTestMemory();

  const outcome = await memory.store.writes.remember({
    text: 'I like quiet mornings',
    subject: 'self',
    caller: buildMockWriteCaller({
      origin: 'task',
      thread: 'task-1',
      taskID: 'task-1',
      hasSelfNoteGrant: true,
      isSelfNoteOnly: true,
    }),
    verdict: { kind: 'gate' },
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'self_note' });
});

test('it refuses moving a self-note into the owner subject through a tool that only the grant gives a task', async () => {
  const memory = await startTestMemory();

  const note = await memory.store.remember({
    text: 'I like quiet mornings',
    subject: 'self',
    provenance: buildMockProvenance(),
  });

  const write = memory.store.writes.remember({
    text: 'I like quiet mornings',
    target: note,
    subject: 'owner',
    caller: buildMockWriteCaller({
      origin: 'task',
      thread: 'task-1',
      taskID: 'task-1',
      hasSelfNoteGrant: true,
      isSelfNoteOnly: true,
    }),
    verdict: { kind: 'gate' },
  });

  expect(write).rejects.toThrow(SelfNoteError);
});
