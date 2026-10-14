import { expect, test } from 'bun:test';
import { z } from 'zod';
import { planDiffRecord } from './plan-diff-record';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startTestMemory } from './test-utils/start-test-memory';

test('it plans each change with only the keys that a release before reads', async () => {
  const memory = await startTestMemory();
  const item = await createMemoryItem(memory.store, { text: 'Keeps bees' });

  const record = await planDiffRecord(memory.log, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'Stale.', source: 'owner' }],
    model: 'claude-test-1',
    shownItems: 1,
    now: Date.now(),
    lapseMs: 60_000,
    definitions: { snapshotHash: 'sha256:test' },
  });
  const changes = z.array(z.record(z.string(), z.json())).parse(record.payload?.['changes']);

  // 0.16.0's reader takes each change as a strict object, so one more key fails its rebuild
  expect(changes.map((change) => Object.keys(change).toSorted())).toStrictEqual([
    ['actionHash', 'changeID', 'inputs', 'itemID', 'kind', 'lapseAt', 'sealed', 'source'],
  ]);
});
