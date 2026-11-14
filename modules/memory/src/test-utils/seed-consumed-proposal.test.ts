import { expect, test } from 'bun:test';
import { buildTestClock } from '@heynixie/testing';
import type { MemoryTables } from '../types';
import { seedConsumedProposal } from './seed-consumed-proposal';
import { startTestMemory } from './start-test-memory';

async function setupTest() {
  const clock = buildTestClock(Date.parse('2026-11-02T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  const deps = { store: memory.store, log: memory.log, clock };

  return { ...deps, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test('it leaves the proposal in the consumed status', async () => {
  const ctx = await setupTest();
  const proposal = await seedConsumedProposal(ctx, { text: 'Keeps bees' });

  const row = await ctx.db
    .selectFrom('memory_proposals')
    .select(['proposal_id', 'status'])
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ proposal_id: proposal.proposalID, status: 'consumed' });
});

test('it applies the text override to a consumed proposal', async () => {
  const ctx = await setupTest();
  const proposal = await seedConsumedProposal(ctx, { text: 'Keeps bees' });
  const history = await ctx.store.readHistory(proposal.itemID);

  expect(history?.versions[0]).toMatchObject({ status: 'readable', text: 'Keeps bees' });
});
