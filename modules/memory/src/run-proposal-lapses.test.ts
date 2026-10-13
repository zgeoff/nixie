import { expect, test } from 'bun:test';
import { findRecordKeys } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { createProposal } from './test-utils/create-proposal';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

test("it lapses a proposal past its lapse time and drops its new item's key", async () => {
  const clock = buildTestClock(1_000_000);
  const memory = await startTestMemory({
    gate: {
      clock,
      limits: { evidenceWindow: 20, proposalLapseMs: 5000, proposalCap: 10, closeMatchScore: 0.6 },
    },
  });
  const proposed = await createProposal(memory.store, { text: 'Likes jazz' });

  clock.advance(5000);

  const lapsed = await memory.store.proposals.lapse();
  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select(['status', 'item_id'])
    .where('proposal_id', '=', proposed.proposalID)
    .executeTakeFirstOrThrow();
  const keys = await findRecordKeys(memory.log, [row.item_id]);

  expect(lapsed).toBe(1);
  expect(row.status).toBe('lapsed');
  expect(keys.get(row.item_id)).toBeUndefined();
});

test('it never lapses a proposal before its lapse time', async () => {
  const clock = buildTestClock(1_000_000);
  const memory = await startTestMemory({
    gate: {
      clock,
      limits: { evidenceWindow: 20, proposalLapseMs: 5000, proposalCap: 10, closeMatchScore: 0.6 },
    },
  });

  await memory.store.writes.remember({
    text: 'Likes jazz',
    caller: {
      origin: 'conversation',
      thread: 'conversation',
      taskID: 'conversation',
      runID: 'conversation',
      model: 'claude-opus-5-5',
    },
  });
  clock.advance(4999);

  const lapsed = await memory.store.proposals.lapse();
  const pending = await memory.store.proposals.listPending();

  expect(lapsed).toBe(0);
  expect(pending).toHaveLength(1);
});
