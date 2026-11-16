import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { readPurgeRows } from './read-purge-rows';
import { seedBegunPurge } from './seed-begun-purge';
import { startTestMemory } from './start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return {
    memory,
    readPurges: () => readPurgeRows(memory.writer.db),
    readKinds: async () => {
      const entries = await readRecords(memory.log, { afterSequence: 0, limit: 10 });

      return entries.map((entry) => entry.record.kind);
    },
  };
}

test('it writes the forget start and the purge set, and leaves every item with an open purge', async () => {
  const ctx = await setupTest();

  await seedBegunPurge(ctx.memory.log, { recordSequence: 7, itemIDs: ['item-1', 'item-2'] });

  const kinds = await ctx.readKinds();
  const purges = await ctx.readPurges();

  expect(kinds).toStrictEqual(['record.forget_started', 'memory.evidence_purge_started']);

  expect(purges).toStrictEqual([
    { record_sequence: 7, item_id: 'item-1', closed_sequence: null, purged_sequence: null },
    { record_sequence: 7, item_id: 'item-2', closed_sequence: null, purged_sequence: null },
  ]);
});

test('it writes no forget start for a purge that no record forget owns', async () => {
  const ctx = await setupTest();

  await seedBegunPurge(ctx.memory.log, { recordSequence: null, itemIDs: ['item-1'] });

  const kinds = await ctx.readKinds();

  expect(kinds).toStrictEqual(['memory.evidence_purge_started']);
});
