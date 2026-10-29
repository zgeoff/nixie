import { expect, test } from 'bun:test';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { localDataStorage, withWriteTransaction } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { sql } from 'kysely';
import { writeReceivedReceipts } from './write-received-receipts';

async function setupTest() {
  const log = await startTestLog();

  await mkdir(join(log.dataDir, 'backup'));

  return { ...log, context: { writer: log.writer, storage: localDataStorage } };
}

test('it records a published receipt with its snapshot IDs, and removes the set from staging', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, async (tx) => {
    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (3, 'scheduled', 'staged', 0, 1798761600000)`.execute(tx);
  });

  const receipt = JSON.stringify({
    format: 1,
    sequence: 3,
    writtenAt: 1_798_761_660_000,
    status: 'published',
    dataSnapshotID: 'a'.repeat(64),
    keySnapshotID: 'b'.repeat(64),
    removedKeySnapshotIDs: ['c'.repeat(64)],
    prune: 'passed',
    check: 'passed',
    failure: null,
  });

  await mkdir(join(ctx.dataDir, 'backup', '000000000003'));
  await writeFile(join(ctx.dataDir, 'backup', '000000000003', 'complete'), '');
  await writeFile(join(ctx.dataDir, 'backup', '000000000003', 'receipt.json'), receipt);

  const received = await writeReceivedReceipts(ctx.context);
  const names = await readdir(join(ctx.dataDir, 'backup'));
  const rows = await sql`select * from backup_sets`.execute(ctx.writer.db);

  expect(received).toStrictEqual([{ sequence: 3, status: 'published', failure: null }]);
  expect(names).toStrictEqual([]);

  expect(rows.rows).toStrictEqual([
    {
      sequence: 3,
      kind: 'scheduled',
      state: 'published',
      log_head: 0,
      staged_at: 1_798_761_600_000,
      received_at: Date.parse('2026-10-16T09:00:00Z'),
      data_snapshot_id: 'a'.repeat(64),
      key_snapshot_id: 'b'.repeat(64),
      receipt,
    },
  ]);
});

test('it records a failed receipt with the failure it names', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, async (tx) => {
    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (3, 'forget', 'staged', 0, 1798761600000)`.execute(tx);
  });

  await mkdir(join(ctx.dataDir, 'backup', '000000000003'));

  await writeFile(
    join(ctx.dataDir, 'backup', '000000000003', 'receipt.json'),
    JSON.stringify({
      format: 1,
      sequence: 3,
      writtenAt: 1_798_761_660_000,
      status: 'failed',
      dataSnapshotID: null,
      keySnapshotID: null,
      removedKeySnapshotIDs: [],
      prune: 'not-run',
      check: 'not-run',
      failure: 'restic backup of nixie.db exited 1',
    }),
  );

  const received = await writeReceivedReceipts(ctx.context);
  const rows = await sql`select state from backup_sets`.execute(ctx.writer.db);

  expect(received).toStrictEqual([
    { sequence: 3, status: 'failed', failure: 'restic backup of nixie.db exited 1' },
  ]);

  expect(rows.rows).toStrictEqual([{ state: 'failed' }]);
});

test('it refuses a receipt that names another set, and leaves the staged row waiting', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, async (tx) => {
    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (3, 'scheduled', 'staged', 0, 1798761600000)`.execute(tx);
  });

  await mkdir(join(ctx.dataDir, 'backup', '000000000003'));

  await writeFile(
    join(ctx.dataDir, 'backup', '000000000003', 'receipt.json'),
    JSON.stringify({
      format: 1,
      sequence: 2,
      writtenAt: 1_798_761_660_000,
      status: 'failed',
      dataSnapshotID: null,
      keySnapshotID: null,
      removedKeySnapshotIDs: [],
      prune: 'not-run',
      check: 'not-run',
      failure: 'restic backup of nixie.db exited 1',
    }),
  );

  const received = await writeReceivedReceipts(ctx.context);
  const rows = await sql`select state from backup_sets`.execute(ctx.writer.db);

  expect(received).toStrictEqual([
    {
      sequence: 3,
      refused: 'the receipt names set 2, and it sits in the directory of set 3',
    },
  ]);

  expect(rows.rows).toStrictEqual([{ state: 'staged' }]);
});

test('it refuses a receipt it cannot read, naming the field', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dataDir, 'backup', '000000000003'));

  await writeFile(
    join(ctx.dataDir, 'backup', '000000000003', 'receipt.json'),
    JSON.stringify({ format: 1, sequence: 3 }),
  );

  const received = await writeReceivedReceipts(ctx.context);

  expect(received).toStrictEqual([
    { sequence: 3, refused: expect.toInclude('writtenAt: Invalid input') },
  ]);
});

test('it refuses a receipt for a set nixie holds no staged row for', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dataDir, 'backup', '000000000008'));

  await writeFile(
    join(ctx.dataDir, 'backup', '000000000008', 'receipt.json'),
    JSON.stringify({
      format: 1,
      sequence: 8,
      writtenAt: 1_798_761_660_000,
      status: 'failed',
      dataSnapshotID: null,
      keySnapshotID: null,
      removedKeySnapshotIDs: [],
      prune: 'not-run',
      check: 'not-run',
      failure: 'restic backup of nixie.db exited 1',
    }),
  );

  const received = await writeReceivedReceipts(ctx.context);

  expect(received).toStrictEqual([
    {
      sequence: 8,
      refused: 'nixie holds no staged set 8, so the receipt answers no set it waits on',
    },
  ]);
});

test('it leaves a set with no receipt in staging', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dataDir, 'backup', '000000000003'));
  await writeFile(join(ctx.dataDir, 'backup', '000000000003', 'complete'), '');

  const received = await writeReceivedReceipts(ctx.context);

  expect(received).toStrictEqual([]);

  const names = await readdir(join(ctx.dataDir, 'backup'));

  expect(names).toStrictEqual(['000000000003']);
});
