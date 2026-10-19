import { expect, test } from 'bun:test';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { findRecordKeys, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { createProposal } from './test-utils/create-proposal';
import { startKeyStoreReader } from './test-utils/start-key-store-reader';
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

// each blocked checkpoint waits out the key store's busy timeout, 50 ms here, before it reports the reader
test('it finishes on the next lapse sweep a key removal whose checkpoint a reader blocked', async () => {
  const clock = buildTestClock(1_000_000);

  const memory = await startTestMemory({
    keyStoreBusyTimeoutMs: 50,
    gate: {
      clock,
      limits: { evidenceWindow: 20, proposalLapseMs: 5000, proposalCap: 10, closeMatchScore: 0.6 },
    },
  });

  await createProposal(memory.store, { text: 'Likes jazz' });

  const reader = await startKeyStoreReader(memory.dataDir);

  clock.advance(5000);

  const blocked = await memory.store.proposals.lapse().then(
    () => 'finished',
    () => 'blocked',
  );

  await reader.release();
  await memory.store.proposals.lapse();

  expect(blocked).toBe('blocked');
  expect(stat(join(memory.dataDir, 'keys.db-wal'))).resolves.toMatchObject({ size: 0 });
});
