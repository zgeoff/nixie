import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { buildMockWriteCaller } from './test-utils/build-mock-write-caller';
import { makeToolAllowRule } from './test-utils/make-tool-allow-rule';
import { startTestMemory } from './test-utils/start-test-memory';

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

test('it pins an item at once under an allow rule that names memory.pin, with no proposal', async () => {
  const memory = await startTestMemory({
    gate: { findAllowRule: makeToolAllowRule('memory.pin') },
  });

  const item = await memory.store.remember({
    text: 'Takes the early ferry on Mondays',
    provenance: buildMockProvenance({ origin: 'conversation', source: 'untrusted' }),
  });

  const outcome = await memory.store.writes.pin({
    target: item,
    caller: buildMockWriteCaller({ thread: 'harbour' }),
  });

  const pending = await memory.store.proposals.listPending();
  const core = await memory.store.readPinnedCore();
  const records = await readRecords(memory.log, { afterSequence: 0, kinds: ['memory.pinned'] });

  expect(outcome).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 1 });
  expect(pending).toStrictEqual([]);
  expect(core).toMatchObject([{ itemID: item.itemID }]);

  expect(records.map((entry) => [entry.record.thread, entry.record.payload])).toStrictEqual([
    ['harbour', { itemID: item.itemID, isPinned: true }],
  ]);
});

test('it proposes a pin under an allow rule that names another tool', async () => {
  const memory = await startTestMemory({
    gate: { findAllowRule: makeToolAllowRule('memory.remember') },
  });

  const item = await memory.store.remember({
    text: 'Takes the early ferry on Mondays',
    provenance: buildMockProvenance({ origin: 'conversation', source: 'untrusted' }),
  });

  const outcome = await memory.store.writes.pin({ target: item, caller: buildMockWriteCaller() });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'pinned' });
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
