import { expect, test } from 'bun:test';
import { readRecordKeys } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import type { ConsolidationTables } from './consolidation-types';
import { decodeConsolidationSummary } from './decode-consolidation-summary';
import { createConsolidationDiff } from './test-utils/create-consolidation-diff';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const clock = buildTestClock(Date.parse('2026-10-12T09:00:00Z'));

  // the shares a stored summary holds, as the test reads them back from the raw row
  const summaryShares = z.array(z.strictObject({ itemID: z.string(), sealed: z.string() }));

  const memory = await startTestMemory({ gate: { clock } });

  return {
    memory,
    clock,

    // the one run's summary as the raw row keeps it, sealed
    readSealedSummary: async () => {
      const run = await memory.log.writer.db
        .$extendTables<ConsolidationTables>()
        .selectFrom('memory_consolidations')
        .selectAll()
        .executeTakeFirstOrThrow();

      return {
        sealed: run.summary ?? '',
        shares: summaryShares.parse(JSON.parse(run.summary_shares ?? '[]')),
      };
    },
  };
}

test('it leaves a stored summary that no key left opens once an item it names is forgotten', async () => {
  const ctx = await setupTest();

  const [oat, black] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(ctx.memory.store, { text: 'Drinks coffee black' }),
  ]);

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [],
    summary: { text: 'Two items about coffee conflict.', itemIDs: [oat.itemID, black.itemID] },
    now: ctx.clock.now(),
  });

  await ctx.memory.store.forget({
    target: oat,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const sealed = await ctx.readSealedSummary();
  const left = await readRecordKeys(ctx.memory.log, [oat.itemID, black.itemID]);

  // the key left also stands in the forgotten item's place
  const kept = left.get(black.itemID) ?? null;

  invariant(kept);

  expect([...left.keys()]).toStrictEqual([black.itemID]);

  expect(
    decodeConsolidationSummary(
      diff.diffID,
      sealed,
      new Map([
        [oat.itemID, kept],
        [black.itemID, kept],
      ]),
    ),
  ).rejects.toThrow();
});
