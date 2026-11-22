import { expect, test } from 'bun:test';
import { createFakeClock } from '@zgeoff/testing/clock';
import type { MemoryTables } from '../types';
import { buildMockWriteCaller } from './build-mock-write-caller';
import { seedRejectedProposal } from './seed-rejected-proposal';
import { startTestMemory } from './start-test-memory';

async function setupTest() {
  const clock = createFakeClock({ startMs: Date.parse('2026-11-02T09:00:00Z') });

  const memory = await startTestMemory({ gate: { clock } });

  const deps = { store: memory.store, log: memory.log, clock };

  return { ...deps, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test('it leaves the proposal in the rejected status', async () => {
  const ctx = await setupTest();
  const proposal = await seedRejectedProposal(ctx);

  const row = await ctx.db
    .selectFrom('memory_proposals')
    .select(['proposal_id', 'status'])
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ proposal_id: proposal.proposalID, status: 'rejected' });
});

// the rejection shreds the proposal's text, so the test checks the caller override that outlives it
test('it applies the caller override to a rejected proposal', async () => {
  const ctx = await setupTest();

  const proposal = await seedRejectedProposal(ctx, {
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
