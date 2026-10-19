import { expect, onTestFinished, test } from 'bun:test';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import { sql } from 'kysely';
import { KeyStoreBusyError } from './key-store-busy-error';
import { startTestLog } from './test-utils/start-test-log';
import { writeKeyStoreCheckpoint } from './write-key-store-checkpoint';
import { writeRecords } from './write-records';

function setupTest(options: { readonly keyStoreBusyTimeoutMs?: number } = {}) {
  return startTestLog(options);
}

test("it empties the key store's WAL", async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'a message with a key' },
    },
  ]);

  await writeKeyStoreCheckpoint(ctx.log, null);

  const wal = await stat(join(ctx.dataDir, 'keys.db-wal'));

  expect(wal.size).toBe(0);
});

test('it finishes with a short busy timeout when no connection holds a read', async () => {
  const ctx = await setupTest({ keyStoreBusyTimeoutMs: 50 });

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'a message with a key' },
    },
  ]);

  await expect(writeKeyStoreCheckpoint(ctx.log, null)).toResolve();
});

// the key store waits out its busy timeout, 50 ms here, before it reports the reader
test('it refuses while another connection holds a read on the key store', async () => {
  const ctx = await setupTest({ keyStoreBusyTimeoutMs: 50 });

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'a message with a key' },
    },
  ]);

  const reader = startDatabase(join(ctx.dataDir, 'keys.db'));

  onTestFinished(() => reader.destroy());

  await sql`begin`.execute(reader);
  await sql`select count(*) from record_keys`.execute(reader);

  expect(writeKeyStoreCheckpoint(ctx.log, null)).rejects.toBeInstanceOf(KeyStoreBusyError);
});
