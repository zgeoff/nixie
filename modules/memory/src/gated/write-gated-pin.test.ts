import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { buildAllowVerdict } from '../test-utils/build-allow-verdict';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { buildMockWriteCaller } from '../test-utils/build-mock-write-caller';
import { startTestMemory } from '../test-utils/start-test-memory';

test('it proposes a pin of an active fact for review, and leaves the pinned core as it was', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Takes the early ferry on Mondays',
    provenance: buildMockProvenance({ origin: 'conversation', source: 'untrusted' }),
  });

  const outcome = await memory.store.writes.pin({ target: item, caller: buildMockWriteCaller() });
  const pending = await memory.store.proposals.listPending();
  const core = await memory.store.readPinnedCore();

  expect(outcome).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    reason: 'pinned',
    merged: false,
  });

  expect(pending).toMatchObject([
    {
      operation: 'pin',
      itemID: item.itemID,
      targetVersion: 1,
      isPinned: true,
      reason: 'pinned',
      text: 'Takes the early ferry on Mondays',
      quote: null,
    },
  ]);

  expect(core).toStrictEqual([]);
});

test('it refuses a pin of a retired item, and writes nothing', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: buildMockProvenance(),
  });

  const retired = await memory.store.retire({ target: item, provenance: buildMockProvenance() });

  const pin = memory.store.writes.pin({ target: retired, caller: buildMockWriteCaller() });

  await pin.catch(() => {});

  const pending = await memory.store.proposals.listPending();
  const records = await readRecords(memory.log, { afterSequence: 0, kinds: ['memory.pinned'] });

  expect(pin).rejects.toMatchObject({ code: 'WRONG_STATE' });
  expect(pending).toStrictEqual([]);
  expect(records).toStrictEqual([]);
});

test('it refuses a pin of an item whose end time passed before the sweep, and writes nothing', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  const item = await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    provenance: buildMockProvenance(),
  });

  clock.advance(Date.parse('2026-10-20T00:41:00Z') - clock.now());

  const pin = memory.store.writes.pin({ target: item, caller: buildMockWriteCaller() });

  await pin.catch(() => {});

  const pending = await memory.store.proposals.listPending();
  const records = await readRecords(memory.log, { afterSequence: 0, kinds: ['memory.pinned'] });

  expect(pin).rejects.toMatchObject({ code: 'WRONG_STATE' });
  expect(pending).toStrictEqual([]);
  expect(records).toStrictEqual([]);
});

test('it refuses a pin of a version the item moved past, and writes nothing', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Takes the early ferry on Mondays',
    provenance: buildMockProvenance(),
  });

  await memory.store.remember({
    text: 'Takes the late ferry on Mondays',
    target: item,
    provenance: buildMockProvenance(),
  });

  const pin = memory.store.writes.pin({ target: item, caller: buildMockWriteCaller() });

  await pin.catch(() => {});

  const pending = await memory.store.proposals.listPending();
  const records = await readRecords(memory.log, { afterSequence: 0, kinds: ['memory.pinned'] });

  expect(pin).rejects.toMatchObject({ code: 'STALE_VERSION' });
  expect(pending).toStrictEqual([]);
  expect(records).toStrictEqual([]);
});

test('it answers a pin of an item already in the pinned core as applied, and writes nothing', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Takes the early ferry on Mondays',
    isPinned: true,
    provenance: buildMockProvenance(),
  });

  const before = await readRecords(memory.log, { afterSequence: 0 });
  const outcome = await memory.store.writes.pin({ target: item, caller: buildMockWriteCaller() });
  const after = await readRecords(memory.log, { afterSequence: 0 });

  expect(outcome).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 1 });
  expect(after).toHaveLength(before.length);
});

test('it merges a second pin of the same version into the pending proposal', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Takes the early ferry on Mondays',
    provenance: buildMockProvenance(),
  });

  const first = await memory.store.writes.pin({ target: item, caller: buildMockWriteCaller() });

  const second = await memory.store.writes.pin({
    target: item,
    caller: buildMockWriteCaller({ origin: 'task', thread: 'errands' }),
  });

  const pending = await memory.store.proposals.listPending();

  invariant(first.status === 'proposed');

  expect(second).toStrictEqual({
    status: 'proposed',
    proposalID: first.proposalID,
    reason: 'pinned',
    merged: true,
  });

  expect(pending).toHaveLength(1);
});

test.each([
  { from: 'conversation', caller: buildMockWriteCaller(), thread: 'conversation' },
  {
    from: 'task',
    caller: buildMockWriteCaller({ origin: 'task', thread: 'task-1', taskID: 'task-1' }),
    thread: 'task-1',
  },
] as const)(
  'it pins an item at once with a notice under a covering rule, from the $from',
  async (testCase) => {
    const memory = await startTestMemory();

    const item = await memory.store.remember({
      text: 'Keeps a kettlebell by the door',
      labels: { gist: 'kettlebell', topic: 'home', triggers: [] },
      provenance: buildMockProvenance(),
    });

    const outcome = await memory.store.writes.pin({
      target: item,
      caller: testCase.caller,
      verdict: buildAllowVerdict(),
    });

    const core = await memory.store.readPinnedCore();
    const pending = await memory.store.proposals.listPending();
    const notices = await memory.store.readNotices(testCase.thread);

    expect(outcome).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 1 });
    expect(core).toMatchObject([{ itemID: item.itemID }]);
    expect(pending).toStrictEqual([]);

    expect(notices.flatMap((notice) => notice.entries)).toMatchObject([
      { itemID: item.itemID, change: 'pinned', version: null },
    ]);
  },
);

test('it makes a pin a proposal with the reason ask_rule under an ask rule', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Keeps a kettlebell by the door',
    provenance: buildMockProvenance(),
  });

  const outcome = await memory.store.writes.pin({
    target: item,
    caller: buildMockWriteCaller(),
    verdict: { kind: 'rule-ask', rule: { id: 'rule-b', revision: 3 } },
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'ask_rule' });
});

test.each([
  { from: 'a gate verdict', verdict: { kind: 'gate' } },
  { from: 'no verdict', verdict: undefined },
] as const)('it makes a pin a proposal with the reason pinned under $from', async (testCase) => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Keeps a kettlebell by the door',
    provenance: buildMockProvenance(),
  });

  const outcome = await memory.store.writes.pin({
    target: item,
    caller: buildMockWriteCaller(),
    ...(testCase.verdict === undefined ? {} : { verdict: testCase.verdict }),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'pinned' });
});

test('it fails a pin that a rule applies when the pinned core has no room, and pins nothing', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'x '.repeat(20_000),
    provenance: buildMockProvenance(),
  });

  const pin = memory.store.writes.pin({
    target: item,
    caller: buildMockWriteCaller(),
    verdict: buildAllowVerdict(),
  });

  expect(pin).rejects.toMatchObject({ code: 'PINNED_CORE_FULL' });
});
