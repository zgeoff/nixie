import { expect, test } from 'bun:test';
import { createMemoryItem } from './create-memory-item';
import { readVersionChecks } from './read-version-checks';
import { startTestMemory } from './start-test-memory';

test('it reads the checks of each version of an item, oldest first', async () => {
  const memory = await startTestMemory();
  const created = await createMemoryItem(memory.store, { text: 'Keeps bees on the roof' });

  const edited = await memory.store.remember({
    text: 'Keeps bees in the garden',
    target: created,
    provenance: {
      origin: 'conversation',
      source: 'untrusted',
      taskID: null,
      proposalID: null,
      checks: { rule: { id: 'rule-a', revision: 2 }, tokens: 'pass' },
    },
  });

  const checks = await readVersionChecks(memory, edited.itemID);

  expect(checks).toStrictEqual([null, { rule: { id: 'rule-a', revision: 2 }, tokens: 'pass' }]);
});
