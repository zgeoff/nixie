import { expect, test } from 'bun:test';
import { readPurgeRows } from './read-purge-rows';
import { seedBegunPurge } from './seed-begun-purge';
import { startTestMemory } from './start-test-memory';

test('it reads no row before any purge began', async () => {
  const memory = await startTestMemory();
  const rows = await readPurgeRows(memory.writer.db);

  expect(rows).toStrictEqual([]);
});

test('it reads one row for each item of a purge set, in item order', async () => {
  const memory = await startTestMemory();

  await seedBegunPurge(memory.log, { recordSequence: 3, itemIDs: ['item-b', 'item-a'] });

  const rows = await readPurgeRows(memory.writer.db);

  expect(rows).toStrictEqual([
    { record_sequence: 3, item_id: 'item-a', closed_sequence: null, purged_sequence: null },
    { record_sequence: 3, item_id: 'item-b', closed_sequence: null, purged_sequence: null },
  ]);
});
