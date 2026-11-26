import { expect, test } from 'bun:test';
import { readProposal } from '@heynixie/proposals';
import { createFakeClock } from '@zgeoff/testing/clock';
import type { MemoryTables } from '../types';
import { seedProposal } from './seed-proposal';
import { startTestMemory } from './start-test-memory';

async function setupTest() {
  const clock = createFakeClock({ startMs: Date.parse('2026-11-02T09:00:00Z') });

  const memory = await startTestMemory({ gate: { clock } });

  const deps = { store: memory.store, log: memory.log, clock };

  return { ...deps, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test('it leaves a pending proposal with the text it is given', async () => {
  const ctx = await setupTest();
  const proposal = await seedProposal(ctx, { text: 'Keeps bees' });
  const row = await readProposal(ctx.log.writer.db, proposal.proposalID);

  expect(row?.state).toBe('pending');
  expect(proposal.text).toBe('Keeps bees');
});
