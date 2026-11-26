import { expect, test } from 'bun:test';
import { readRecordKeys } from '@heynixie/log';
import { readProposal } from '@heynixie/proposals';
import { createFakeClock } from '@zgeoff/testing/clock';
import { createProposal } from '../test-utils/create-proposal';
import { lapseTestProposal } from '../test-utils/lapse-test-proposal';
import { startTestMemory } from '../test-utils/start-test-memory';
import type { MemoryTables } from '../types';

test("it lapses a proposal past its lapse time and drops its new item's key", async () => {
  const clock = createFakeClock({ startMs: 1_000_000 });

  const memory = await startTestMemory({
    gate: {
      clock,
      limits: { evidenceWindow: 20, proposalLapseMs: 5000, proposalCap: 10, closeMatchScore: 0.6 },
    },
  });

  const proposed = await createProposal(memory.store, { text: 'Likes jazz' });

  clock.advance(5000);

  const lapsed = await lapseTestProposal(memory, proposed.proposalID);

  await memory.store.proposals.lapse();

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select(['item_id'])
    .where('proposal_id', '=', proposed.proposalID)
    .executeTakeFirstOrThrow();

  const shared = await readProposal(memory.writer.db, proposed.proposalID);
  const keys = await readRecordKeys(memory.log, [row.item_id]);

  expect(lapsed).toBe(true);
  expect(shared?.state).toBe('lapsed');
  expect(keys.get(row.item_id)).toBeUndefined();
});

test('it never lapses a proposal before its lapse time', async () => {
  const clock = createFakeClock({ startMs: 1_000_000 });

  const memory = await startTestMemory({
    gate: {
      clock,
      limits: { evidenceWindow: 20, proposalLapseMs: 5000, proposalCap: 10, closeMatchScore: 0.6 },
    },
  });

  const pendingProposal = await createProposal(memory.store, { text: 'Likes jazz' });

  clock.advance(4999);

  const lapsed = await lapseTestProposal(memory, pendingProposal.proposalID);
  const pending = await memory.store.proposals.listPending();

  expect(lapsed).toBe(false);
  expect(pending).toHaveLength(1);
});
