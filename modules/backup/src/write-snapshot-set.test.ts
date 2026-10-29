import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import { localDataStorage, withWriteTransaction } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { startFaultPointFailure } from '@heynixie/tasks/test-utils';
import { backupSetManifestSchema, parseBackupFile, readFileSHA256 } from '@heynixie/wire';
import { sql } from 'kysely';
import { buildStubFailingStorage } from './test-utils/build-stub-failing-storage';
import { writeSnapshotSet } from './write-snapshot-set';

async function setupTest() {
  const log = await startTestLog();

  return { ...log, context: { writer: log.writer, storage: localDataStorage } };
}

test('it stages copies of both databases with a manifest of their checksums, and writes the marker', async () => {
  const ctx = await setupTest();
  const manifest = await writeSnapshotSet(ctx.context, 'scheduled');

  const directory = join(ctx.dataDir, 'backup', '000000000001');

  const files = await readdir(directory);
  const text = await Bun.file(join(directory, 'manifest.json')).text();

  const written = parseBackupFile(text, backupSetManifestSchema);

  expect(files).toIncludeSameMembers(['nixie.db', 'keys.db', 'manifest.json', 'complete']);
  expect(written).toStrictEqual({ value: manifest });

  expect(manifest).toStrictEqual({
    format: 1,
    kind: 'scheduled',
    sequence: 1,
    stagedAt: Date.parse('2026-10-16T09:00:00Z'),
    copies: [
      { name: 'nixie.db', ...(await readFileSHA256(join(directory, 'nixie.db'))) },
      { name: 'keys.db', ...(await readFileSHA256(join(directory, 'keys.db'))) },
    ],
  });
});

test('it records the staged set with the log head its copy holds', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, async (tx) => {
    await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
      values (7, 1798761600000, 'memory.forgotten', 'snapshot-a', '{}')`.execute(tx);
  });

  await writeSnapshotSet(ctx.context, 'forget');

  const rows = await sql`select sequence, kind, state, log_head from backup_sets`.execute(
    ctx.writer.db,
  );

  expect(rows.rows).toStrictEqual([{ sequence: 1, kind: 'forget', state: 'staged', log_head: 7 }]);
});

test('it copies a database that holds the rows committed before the set', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, async (tx) => {
    await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
      values (3, 1798761600000, 'task.created', 'snapshot-a', '{}')`.execute(tx);
  });

  await writeSnapshotSet(ctx.context, 'scheduled');

  const copy = startDatabase(join(ctx.dataDir, 'backup', '000000000001', 'nixie.db'), {
    readonly: true,
  });

  onTestFinished(() => copy.destroy());

  const rows = await sql`select sequence, kind from records`.execute(copy);

  expect(rows.rows).toStrictEqual([{ sequence: 3, kind: 'task.created' }]);
});

test('it numbers a set above the newest set nixie recorded', async () => {
  const ctx = await setupTest();

  await writeSnapshotSet(ctx.context, 'scheduled');

  const second = await writeSnapshotSet(ctx.context, 'forget');

  expect(second.sequence).toBe(2);
});

test('it numbers a set above a directory in staging that nixie holds no row for', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dataDir, 'backup', '000000000009'), { recursive: true });

  const manifest = await writeSnapshotSet(ctx.context, 'scheduled');

  expect(manifest.sequence).toBe(10);
});

test('it removes the copies and abandons the set when the copy fails before its marker', async () => {
  const ctx = await setupTest();

  startFaultPointFailure('backup.set.copied');

  const failure = await writeSnapshotSet(ctx.context, 'scheduled').then(
    () => null,
    (error: unknown) => error,
  );

  const staging = await readdir(join(ctx.dataDir, 'backup'));
  const rows = await sql`select state from backup_sets`.execute(ctx.writer.db);

  expect(failure).toMatchObject({ message: 'crashed at backup.set.copied' });
  expect(staging).toStrictEqual([]);
  expect(rows.rows).toStrictEqual([{ state: 'abandoned' }]);
});

test('it keeps a set whose marker exists when a later step fails, for the job may be shipping it', async () => {
  const ctx = await setupTest();

  const context = {
    writer: ctx.writer,
    storage: buildStubFailingStorage(localDataStorage, 'complete'),
  };

  const failure = await writeSnapshotSet(context, 'scheduled').then(
    () => null,
    (error: unknown) => error,
  );

  const files = await readdir(join(ctx.dataDir, 'backup', '000000000001'));
  const rows = await sql`select state from backup_sets`.execute(ctx.writer.db);

  expect(failure).toMatchObject({ message: 'the stub fails the fsync of complete' });
  expect(files).toIncludeSameMembers(['nixie.db', 'keys.db', 'manifest.json', 'complete']);
  expect(rows.rows).toStrictEqual([{ state: 'staging' }]);
});
