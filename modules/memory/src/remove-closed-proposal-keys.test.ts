import { expect, test } from 'bun:test';
import { findRecordKeys, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { createProposal } from './test-utils/create-proposal';
import { startNextTestMemory } from './test-utils/start-next-test-memory';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

test('it removes on the next lapse sweep a key that a closed proposal left behind', async () => {
  const memory = await startTestMemory();
  const proposed = await createProposal(memory.store, { text: 'Likes jazz' });

  // the close commits, and the process dies before the key goes
  await withWriteTransaction(memory.writer, (tx) =>
    writeRecordsInTransaction(tx, memory.log, [
      {
        kind: 'memory.proposal_lapsed',
        definitions: { snapshotHash: 'sha256:test' },
        payload: { proposalID: proposed.proposalID },
      },
    ]),
  );

  await memory.store.proposals.lapse();

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select('item_id')
    .where('proposal_id', '=', proposed.proposalID)
    .executeTakeFirstOrThrow();
  const keys = await findRecordKeys(memory.log, [row.item_id]);

  expect(keys.get(row.item_id)).toBeUndefined();
});

test('it removes at start a key that a rejected proposal left behind', async () => {
  const memory = await startTestMemory();
  const proposed = await createProposal(memory.store, { text: 'Likes jazz' });

  // the rejection commits, and the process dies before the key goes
  await withWriteTransaction(memory.writer, (tx) =>
    writeRecordsInTransaction(tx, memory.log, [
      {
        kind: 'memory.proposal_rejected',
        definitions: { snapshotHash: 'sha256:test' },
        payload: { proposalID: proposed.proposalID },
      },
    ]),
  );

  const next = await startNextTestMemory(memory);
  const row = await next.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select('item_id')
    .where('proposal_id', '=', proposed.proposalID)
    .executeTakeFirstOrThrow();
  const keys = await findRecordKeys(next.log, [row.item_id]);

  expect(keys.get(row.item_id)).toBeUndefined();
});

test('it never removes the key of a pending proposal', async () => {
  const memory = await startTestMemory();
  const proposed = await createProposal(memory.store, { text: 'Likes jazz' });

  await memory.store.proposals.lapse();

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select('item_id')
    .where('proposal_id', '=', proposed.proposalID)
    .executeTakeFirstOrThrow();
  const keys = await findRecordKeys(memory.log, [row.item_id]);

  expect(keys.get(row.item_id)).toBeInstanceOf(CryptoKey);
});
