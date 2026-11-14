import { expect, test } from 'bun:test';
import { buildTestClock } from '@heynixie/testing';
import type { MemoryTables } from '../types';
import { buildMockWriteCaller } from './build-mock-write-caller';
import { seedLapsedProposal } from './seed-lapsed-proposal';
import { startTestMemory } from './start-test-memory';

async function setupTest() {
  const clock = buildTestClock(Date.parse('2026-11-02T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  const deps = { store: memory.store, log: memory.log, clock };

  return { ...deps, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test('it leaves the proposal in the lapsed status', async () => {
  const ctx = await setupTest();
  const proposal = await seedLapsedProposal(ctx, { text: 'Keeps bees' });

  const row = await ctx.db
    .selectFrom('memory_proposals')
    .select(['proposal_id', 'status'])
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ proposal_id: proposal.proposalID, status: 'lapsed' });
});

// the lapse shreds the proposal's text, so the test checks the caller override that outlives it
test('it applies the caller override to a lapsed proposal', async () => {
  const ctx = await setupTest();

  const proposal = await seedLapsedProposal(ctx, {
    text: 'Keeps bees',
    caller: buildMockWriteCaller({ thread: 'garden', taskID: 'task-7' }),
  });

  const row = await ctx.db
    .selectFrom('memory_proposals')
    .select(['proposal_id', 'thread', 'task_id'])
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({
    proposal_id: proposal.proposalID,
    thread: 'garden',
    task_id: 'task-7',
  });
});
