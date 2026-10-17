import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

test('it folds a proposal record whose review reason a later release wrote, keeping the reason', async () => {
  const memory = await startTestMemory();

  await writeRecords(memory.log, [
    {
      kind: 'memory.proposed',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'untrusted',
      payload: {
        proposalID: 'proposal-a',
        itemID: 'item-a',
        isNewItem: true,
        operation: 'remember',
        targetVersion: null,
        isPinned: false,
        reviewReason: 'quote_too_old',
        actionHash: 'hash-a',
        sealed: 'c2VhbGVk',
        evidence: null,
        origin: 'conversation',
        source: 'untrusted',
        taskID: 'conversation',
        capGroup: 'turn-1',
        checks: null,
        model: 'claude-opus-5-5',
        noticeKey: null,
        lapseAt: 1_800_000_000_000,
      },
    },
  ]);

  const rows = await memory.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select(['proposal_id', 'review_reason', 'status'])
    .execute();

  expect(rows).toStrictEqual([
    { proposal_id: 'proposal-a', review_reason: 'quote_too_old', status: 'pending' },
  ]);
});
