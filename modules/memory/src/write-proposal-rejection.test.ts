import { expect, test } from 'bun:test';
import { findRecordKeys } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

test('it rejects a proposal and drops the key of the item it would have created', async () => {
  const memory = await startTestMemory();

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

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  await memory.store.proposals.reject({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select('status')
    .where('proposal_id', '=', pending.proposalID)
    .executeTakeFirstOrThrow();
  const keys = await findRecordKeys(memory.log, [pending.itemID]);

  expect(row.status).toBe('rejected');
  expect(keys.get(pending.itemID)).toBeUndefined();
});

test('it keeps the key of an existing item when you reject an edit of it', async () => {
  const memory = await startTestMemory();
  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.writes.remember({
    text: 'Lives on Oak Avenue',
    target: item,
    caller: {
      origin: 'conversation',
      thread: 'conversation',
      taskID: 'conversation',
      runID: 'conversation',
      model: 'claude-opus-5-5',
    },
  });

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  await memory.store.proposals.reject({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  const recalled = await memory.store.recall({ itemIDs: [item.itemID] });

  expect(recalled.items).toMatchObject([{ text: 'Lives on Elm Street' }]);
});
