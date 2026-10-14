import { expect, test } from 'bun:test';
import { buildShortIDFromUUID } from '@heynixie/db';
import invariant from 'tiny-invariant';
import { createConsolidationDiff } from './test-utils/create-consolidation-diff';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startTestMemory } from './test-utils/start-test-memory';

test('it gives each change the short ID its UUID gives', async () => {
  const memory = await startTestMemory();
  const [trip, stale] = await Promise.all([
    createMemoryItem(memory.store, { text: 'Is in Lisbon until May' }),
    createMemoryItem(memory.store, { text: 'Has a dentist appointment' }),
  ]);

  const diff = await createConsolidationDiff(memory, {
    changes: [
      { kind: 'retire', inputs: [trip], reason: 'The trip has ended.', source: 'owner' },
      { kind: 'retire', inputs: [stale], reason: 'The date has passed.', source: 'owner' },
    ],
  });
  const [first, second] = diff.changes;

  invariant(first && second);
  expect(first.shortID).toBe(buildShortIDFromUUID(first.changeID));
  expect(second.shortID).toBe(buildShortIDFromUUID(second.changeID));
});
