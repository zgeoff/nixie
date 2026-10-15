import { expect, test } from 'bun:test';
import { z } from 'zod';
import { planDiffRecord } from './plan-diff-record';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startTestMemory } from './test-utils/start-test-memory';

test('it plans the diff with only the keys that a release before reads, and the summary as a record of its own', async () => {
  const memory = await startTestMemory();

  const [item, other] = await Promise.all([
    createMemoryItem(memory.store, { text: 'Keeps bees' }),
    createMemoryItem(memory.store, { text: 'Keeps no pets' }),
  ]);

  const records = await planDiffRecord(memory.log, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'Stale.', source: 'owner' }],
    model: 'claude-test-1',
    shownItems: 2,
    summary: { text: 'Two items about pets conflict.', itemIDs: [item.itemID, other.itemID] },
    now: Date.now(),
    lapseMs: 60_000,
    definitions: { snapshotHash: 'sha256:test' },
  });

  const [proposed, summarized] = records;
  const changes = z.array(z.record(z.string(), z.json())).parse(proposed?.payload?.['changes']);

  // 0.16.0's reader takes the diff and each change as strict objects, so one more key fails its
  // rebuild, and it skips a record of a kind it does not know
  expect(Object.keys(proposed?.payload ?? {}).toSorted()).toStrictEqual([
    'at',
    'changes',
    'diffID',
    'model',
    'shownItems',
  ]);

  expect(changes.map((change) => Object.keys(change).toSorted())).toStrictEqual([
    ['actionHash', 'changeID', 'inputs', 'itemID', 'kind', 'lapseAt', 'sealed', 'source'],
  ]);

  expect(records.map((record) => record.kind)).toStrictEqual([
    'memory.consolidation_proposed',
    'memory.consolidation_summarized',
  ]);

  expect(summarized?.payload?.['diffID']).toBe(proposed?.payload?.['diffID']);
});

test('it plans no summary record when the session left no summary', async () => {
  const memory = await startTestMemory();
  const item = await createMemoryItem(memory.store, { text: 'Keeps bees' });

  const records = await planDiffRecord(memory.log, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'Stale.', source: 'owner' }],
    model: 'claude-test-1',
    shownItems: 1,
    summary: null,
    now: Date.now(),
    lapseMs: 60_000,
    definitions: { snapshotHash: 'sha256:test' },
  });

  expect(records.map((record) => record.kind)).toStrictEqual(['memory.consolidation_proposed']);
});

test('it drops the summary when an item the session was shown lost its key since the read', async () => {
  const memory = await startTestMemory();

  const [kept, forgotten] = await Promise.all([
    createMemoryItem(memory.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(memory.store, { text: 'Drinks coffee black' }),
  ]);

  await memory.store.forget({
    target: forgotten,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const records = await planDiffRecord(memory.log, {
    changes: [],
    model: 'claude-test-1',
    shownItems: 2,
    summary: { text: 'Two items about coffee conflict.', itemIDs: [kept.itemID, forgotten.itemID] },
    now: Date.now(),
    lapseMs: 60_000,
    definitions: { snapshotHash: 'sha256:test' },
  });

  expect(records.map((record) => record.kind)).toStrictEqual(['memory.consolidation_proposed']);
});
