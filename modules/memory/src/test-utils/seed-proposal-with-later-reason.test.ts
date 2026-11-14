import { expect, test } from 'bun:test';
import { buildTestClock } from '@heynixie/testing';
import type { MemoryTables } from '../types';
import { seedProposalWithLaterReason } from './seed-proposal-with-later-reason';
import { startTestMemory } from './start-test-memory';

async function setupTest() {
  const clock = buildTestClock(Date.parse('2026-11-02T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  const deps = { store: memory.store, log: memory.log, clock };

  return { ...deps, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test('it leaves a pending proposal whose review reason a later release wrote', async () => {
  const ctx = await setupTest();
  const proposal = await seedProposalWithLaterReason(ctx, { text: 'Keeps bees' });

  const row = await ctx.db
    .selectFrom('memory_proposals')
    .select(['proposal_id', 'status', 'review_reason'])
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({
    proposal_id: proposal.proposalID,
    status: 'pending',
    review_reason: 'quote_too_old',
  });
});
