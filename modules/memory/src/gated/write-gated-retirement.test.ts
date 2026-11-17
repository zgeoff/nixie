import { expect, mock, test } from 'bun:test';
import { buildTestClock, makeGatedCall } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { buildAllowVerdict } from '../test-utils/build-allow-verdict';
import { buildMockCheckerAnswer } from '../test-utils/build-mock-checker-answer';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { buildMockWriteCaller } from '../test-utils/build-mock-write-caller';
import { readVersionChecks } from '../test-utils/read-version-checks';
import { startTestMemory } from '../test-utils/start-test-memory';
import { writeOwnerMessageRecord } from '../test-utils/write-owner-message-record';
import { readVersion } from '../version/read-version';

test('it retires an item you asked to retire, with your intent quote and the checks', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })));

  const memory = await startTestMemory({
    gate: { check },
    logClock: buildTestClock(Date.parse('2026-10-19T08:14:00Z')),
  });

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: {
      origin: 'conversation',
      source: 'untrusted',
      taskID: 'conversation',
      proposalID: null,
      checks: null,
    },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I moved out of Elm Street last week',
    spans: [{ start: 0, end: 36, source: 'typed' }],
  });

  await memory.store.recall({ query: 'Elm', thread: 'conversation' });

  const outcome = await memory.store.writes.retire({
    target: item,
    intentQuote: 'I moved out of Elm Street',
    caller: buildMockWriteCaller(),
  });

  const history = await memory.store.readHistory(item.itemID);

  expect(outcome).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 2 });

  expect(history?.versions.at(-1)).toMatchObject({
    change: 'retired',
    origin: 'conversation',
    source: 'untrusted',
  });

  expect(check).toHaveBeenCalledExactlyOnceWith({
    prompt: expect.toStartWith('You check one request to retire'),
    input:
      '<sent>Mon 19 Oct 2026, 08:14, UTC (UTC+00:00)</sent>\n\n' +
      '<owner_message>\n«evidence»I moved out of Elm Street«/evidence» last week\n</owner_message>\n\n' +
      '<item_to_retire>\nLives on Elm Street\n</item_to_retire>',
  });
});

test('it checks a retirement again under the definitions that a seed puts in force while the checker runs', async () => {
  const checker = makeGatedCall(() => buildMockCheckerAnswer({ verdict: 'asserted' }));
  const check = mock(checker.call);

  const inForce = {
    current: { snapshotHash: 'sha256:before', prompts: {} },
  };

  const memory = await startTestMemory({
    definitions: () => ({ snapshotHash: inForce.current.snapshotHash }),
    gate: { check, getPromptsInForce: () => inForce.current },
  });

  const item = await memory.store.remember({
    text: 'Rents a plot at the allotment',
    provenance: buildMockProvenance({ origin: 'conversation', source: 'untrusted' }),
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I gave up the allotment plot',
    spans: [{ start: 0, end: 28, source: 'typed' }],
  });

  await memory.store.recall({ query: 'allotment', thread: 'conversation' });

  const retirement = memory.store.writes.retire({
    target: item,
    intentQuote: 'I gave up the allotment plot',
    caller: buildMockWriteCaller(),
  });

  await checker.started;

  inForce.current = {
    snapshotHash: 'sha256:after',
    prompts: {
      'retirement-checker': { parts: {}, template: 'Judge the retirement strictly.' },
    },
  };

  checker.release();

  const outcome = await retirement;

  expect(outcome).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 2 });
  expect(check).toHaveBeenCalledTimes(2);

  expect(check).toHaveBeenLastCalledWith({
    prompt: 'Judge the retirement strictly.',
    input: expect.toEndWith('<item_to_retire>\nRents a plot at the allotment\n</item_to_retire>'),
  });
});

test('it gives the checker the retirement checker prompt override in force', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })));

  const memory = await startTestMemory({
    gate: {
      check,
      getPromptsInForce: () => ({
        snapshotHash: 'sha256:test',
        prompts: {
          'retirement-checker': { parts: { instruction: 'Judge the request.' }, template: null },
        },
      }),
    },
  });

  const item = await memory.store.remember({
    text: 'Rents a plot at the allotment',
    provenance: buildMockProvenance({ origin: 'conversation', source: 'untrusted' }),
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I gave up the allotment plot',
    spans: [{ start: 0, end: 28, source: 'typed' }],
  });

  await memory.store.recall({ query: 'allotment', thread: 'conversation' });

  await memory.store.writes.retire({
    target: item,
    intentQuote: 'I gave up the allotment plot',
    caller: buildMockWriteCaller(),
  });

  expect(check).toHaveBeenCalledExactlyOnceWith({
    prompt: expect.toStartWith('Judge the request.\n\nThe input marks 2 kinds of span.'),
    input: expect.toEndWith('<item_to_retire>\nRents a plot at the allotment\n</item_to_retire>'),
  });
});

test("it retires the conversation's self-note at once, with a notice entry an undo binds to", async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer()));

  const memory = await startTestMemory({ gate: { check } });

  const note = await memory.store.remember({
    text: 'I like opening with a question',
    subject: 'self',
    provenance: buildMockProvenance({ origin: 'conversation', source: 'untrusted' }),
  });

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Morning',
    spans: [{ start: 0, end: 7, source: 'typed' }],
  });

  const outcome = await memory.store.writes.retire({
    target: note,
    caller: buildMockWriteCaller(),
  });

  const notices = await memory.store.readNotices('conversation');

  expect(outcome).toStrictEqual({ status: 'applied', itemID: note.itemID, version: 2 });

  expect(notices).toStrictEqual([
    {
      noticeKey: `turn/conversation/${String(sequence)}`,
      thread: 'conversation',
      remembered: 0,
      retired: 1,
      proposed: 0,
      entries: [
        {
          itemID: note.itemID,
          change: 'retired',
          version: 2,
          proposalID: null,
          sequence: expect.toBeNumber(),
        },
      ],
    },
  ]);

  expect(check).not.toHaveBeenCalled();
});

test("it keeps no intent quote on the conversation's retirement of a self-note", async () => {
  const memory = await startTestMemory();

  const note = await memory.store.remember({
    text: 'I like opening with a question',
    subject: 'self',
    provenance: buildMockProvenance({ origin: 'conversation', source: 'untrusted' }),
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Book the dentist for Friday',
    spans: [{ start: 0, end: 27, source: 'typed' }],
  });

  const outcome = await memory.store.writes.retire({
    target: note,
    intentQuote: 'Book the dentist for Friday',
    caller: buildMockWriteCaller(),
  });

  invariant(outcome.status === 'applied');

  const retired = await readVersion(memory.log, memory.writer.db, outcome);

  expect(retired.text).toStrictEqual({
    text: 'I like opening with a question',
    evidenceQuote: null,
    intentQuote: null,
  });

  expect(retired.row.intent_evidence).toBeNull();
});

test("it brings back a self-note when you undo the conversation's retirement of it", async () => {
  const memory = await startTestMemory();

  const note = await memory.store.remember({
    text: 'I like opening with a question',
    subject: 'self',
    provenance: buildMockProvenance({ origin: 'conversation', source: 'untrusted' }),
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Morning',
    spans: [{ start: 0, end: 7, source: 'typed' }],
  });

  const retired = await memory.store.writes.retire({
    target: note,
    caller: buildMockWriteCaller(),
  });

  invariant(retired.status === 'applied');

  const undone = await memory.store.undo({
    target: { itemID: retired.itemID, version: retired.version },
    provenance: buildMockProvenance(),
  });

  const recalled = await memory.store.recall({ itemIDs: [note.itemID] });

  expect(undone).toStrictEqual({ itemID: note.itemID, version: 3 });
  expect(recalled.items).toMatchObject([{ state: 'active', subject: 'self', change: 'undone' }]);
});

test("it runs a task's retire of a self-note through the intent gate", async () => {
  const memory = await startTestMemory();

  const note = await memory.store.remember({
    text: 'I like opening with a question',
    subject: 'self',
    provenance: buildMockProvenance({ origin: 'conversation', source: 'untrusted' }),
  });

  const outcome = await memory.store.writes.retire({
    target: note,
    caller: buildMockWriteCaller({ origin: 'task', thread: 'task-1', taskID: 'task-1' }),
  });

  const pending = await memory.store.proposals.listPending();

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'ambiguous_target' });
  expect(pending).toMatchObject([{ operation: 'retire', subject: 'self' }]);
});

test('it proposes a retirement of an item the thread never read', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const outcome = await memory.store.writes.retire({
    target: item,
    intentQuote: 'I moved out of Elm Street',
    caller: {
      origin: 'conversation',
      thread: 'conversation',
      logThread: 'conversation',
      taskID: 'conversation',
      runID: 'conversation',
      model: 'claude-opus-5-5',
    },
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'ambiguous_target' });
});

test('it proposes a retirement that cites no intent quote', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.recall({ itemIDs: [item.itemID], thread: 'conversation' });

  const outcome = await memory.store.writes.retire({
    target: item,
    caller: {
      origin: 'conversation',
      thread: 'conversation',
      logThread: 'conversation',
      taskID: 'conversation',
      runID: 'conversation',
      model: 'claude-opus-5-5',
    },
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'no_quote' });
});

test('it proposes a retirement the checker does not confirm', async () => {
  const memory = await startTestMemory({
    gate: {
      check: () =>
        Promise.resolve({
          verdict: 'not_asserted',
          reason: 'A question.',
          model: 'claude-sonnet-5-5',
          failure: null,
        }),
    },
  });

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const text = 'Did I move out of Elm Street?';

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text,
    spans: [{ start: 0, end: text.length, source: 'typed' }],
  });

  await memory.store.recall({ itemIDs: [item.itemID], thread: 'conversation' });

  const outcome = await memory.store.writes.retire({
    target: item,
    intentQuote: 'move out of Elm Street',
    caller: {
      origin: 'conversation',
      thread: 'conversation',
      logThread: 'conversation',
      taskID: 'conversation',
      runID: 'conversation',
      model: 'claude-opus-5-5',
    },
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'checker_not_asserted' });
});

test('it proposes a retirement whose evidence message backed an item you forgot while the checker answered', async () => {
  const checker = makeGatedCall(() => buildMockCheckerAnswer({ verdict: 'asserted' }));

  const memory = await startTestMemory({ gate: { check: checker.call } });

  const [item, sequence] = await Promise.all([
    memory.store.remember({ text: 'Lives on Elm Street', provenance: buildMockProvenance() }),
    writeOwnerMessageRecord(memory.log, {
      thread: 'conversation',
      text: 'I moved out of Elm Street last week',
      spans: [{ start: 0, end: 36, source: 'typed' }],
    }),
  ]);

  const [forgotten] = await Promise.all([
    memory.store.remember({
      text: 'Moved out of Elm Street last week',
      evidenceQuote: 'I moved out of Elm Street last week',
      evidence: { recordSequence: sequence, start: 0, end: 36 },
      provenance: buildMockProvenance(),
    }),
    memory.store.recall({ itemIDs: [item.itemID], thread: 'conversation' }),
  ]);

  const retirement = memory.store.writes.retire({
    target: item,
    intentQuote: 'I moved out of Elm Street',
    caller: buildMockWriteCaller(),
  });

  await checker.started;

  await memory.store.forget({ target: forgotten, provenance: buildMockProvenance() });

  checker.release();

  const outcome = await retirement;

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'forgotten_evidence' });
});

test('it refuses a retirement of a retired item before any check runs', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const retired = await memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const retire = memory.store.writes.retire({
    target: retired,
    caller: {
      origin: 'conversation',
      thread: 'conversation',
      logThread: 'conversation',
      taskID: 'conversation',
      runID: 'conversation',
      model: 'claude-opus-5-5',
    },
  });

  await retire.catch(() => {});

  expect(retire).rejects.toMatchObject({ code: 'WRONG_STATE' });
});

test('it seals a retirement proposal with the item text you review', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const outcome = await memory.store.writes.retire({
    target: item,
    intentQuote: 'forget my old street',
    caller: {
      origin: 'conversation',
      thread: 'conversation',
      logThread: 'conversation',
      taskID: 'conversation',
      runID: 'conversation',
      model: 'claude-opus-5-5',
    },
  });

  const [pending] = await memory.store.proposals.listPending();

  invariant(outcome.status === 'proposed');

  expect(pending).toMatchObject({
    proposalID: outcome.proposalID,
    operation: 'retire',
    itemID: item.itemID,
    targetVersion: 1,
    text: 'Lives on Elm Street',
    quote: 'forget my old street',
  });
});

test('it retires an item at once under an allow rule, with the rule in the checks and neither the intent quote check nor the checker', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer({ verdict: 'not_asserted' })));

  const memory = await startTestMemory({ gate: { check } });

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: buildMockProvenance(),
  });

  const outcome = await memory.store.writes.retire({
    target: item,
    caller: buildMockWriteCaller(),
    verdict: buildAllowVerdict(),
  });

  const history = await memory.store.readHistory(item.itemID);
  const checks = await readVersionChecks(memory, item.itemID);

  expect(outcome).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 2 });
  expect(history?.versions.at(-1)).toMatchObject({ change: 'retired', origin: 'conversation' });
  expect(checks.at(-1)).toStrictEqual({ rule: { id: 'rule-a', revision: 2 } });
  expect(check).not.toHaveBeenCalled();
});

test('it proposes a retirement under an ask rule with the reason ask_rule, though the owner asked for it', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })));

  const memory = await startTestMemory({ gate: { check } });

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: buildMockProvenance(),
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I moved out of Elm Street last week',
    spans: [{ start: 0, end: 36, source: 'typed' }],
  });

  await memory.store.recall({ query: 'Elm', thread: 'conversation' });

  const outcome = await memory.store.writes.retire({
    target: item,
    intentQuote: 'I moved out of Elm Street',
    caller: buildMockWriteCaller(),
    verdict: { kind: 'rule-ask', rule: { id: 'rule-b', revision: 4 } },
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'ask_rule' });
  expect(check).not.toHaveBeenCalled();
});

test('it runs every check on a retirement whose verdict is gate', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: buildMockProvenance(),
  });

  const outcome = await memory.store.writes.retire({
    target: item,
    caller: buildMockWriteCaller(),
    verdict: { kind: 'gate' },
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'ambiguous_target' });
});

test('it reads the sources of a retirement from its intent quote, and adds task for a task run', async () => {
  const memory = await startTestMemory();

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I moved out of Elm Street last week',
    spans: [{ start: 0, end: 36, source: 'typed' }],
  });

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: buildMockProvenance(),
  });

  const owner = await memory.store.writes.readRetireSources({
    target: item,
    intentQuote: 'I moved out of Elm Street',
    caller: buildMockWriteCaller(),
  });

  const outside = await memory.store.writes.readRetireSources({
    target: item,
    caller: buildMockWriteCaller(),
  });

  const task = await memory.store.writes.readRetireSources({
    target: item,
    intentQuote: 'I moved out of Elm Street',
    caller: buildMockWriteCaller({ origin: 'task' }),
  });

  expect(owner).toStrictEqual(['owner']);
  expect(outside).toStrictEqual(['outside']);
  expect(task).toStrictEqual(['owner', 'task']);
});

test.each([
  { from: 'conversation', caller: buildMockWriteCaller(), thread: 'conversation' },
  {
    from: 'task',
    caller: buildMockWriteCaller({ origin: 'task', thread: 'task-1', taskID: 'task-1' }),
    thread: 'task-1',
  },
] as const)(
  'it retires an item at once with a notice under a covering rule, from the $from',
  async (testCase) => {
    const memory = await startTestMemory();

    const item = await memory.store.remember({
      text: 'Keeps a kettlebell by the door',
      labels: { gist: 'kettlebell', topic: 'home', triggers: [] },
      provenance: buildMockProvenance(),
    });

    const outcome = await memory.store.writes.retire({
      target: item,
      caller: testCase.caller,
      verdict: buildAllowVerdict(),
    });

    const notices = await memory.store.readNotices(testCase.thread);

    expect(outcome).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 2 });

    expect(notices.flatMap((notice) => notice.entries)).toMatchObject([
      { itemID: item.itemID, change: 'retired', version: 2 },
    ]);
  },
);
