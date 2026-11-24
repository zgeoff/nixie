import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import { localDataStorage, pauseNixieInTransaction, withWriteTransaction } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { startFaultPointFailure } from '@heynixie/tasks/test-utils';
import { backupSetManifestSchema, parseBackupFile, readFileSHA256 } from '@heynixie/wire';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { buildSeeder } from '../test-utils/build-seeder';
import { buildStubFailingStorage } from '../test-utils/build-stub-failing-storage';
import { stageBackupSet } from '../test-utils/stage-backup-set';

async function setupTest() {
  const log = await startTestLog();

  const context = { writer: log.writer, storage: localDataStorage };

  return { ...log, context, seed: buildSeeder({ log: log.log, context }) };
}

test.each(['writeSnapshotSet', 'the stage pass'] as const)(
  'it stages copies of both databases with a manifest of their checksums, and writes the marker, through %s',
  async (entryPoint) => {
    const ctx = await setupTest();
    const manifest = await stageBackupSet(entryPoint, ctx.context, 'scheduled');

    invariant(manifest, 'a set stages when nixie is not paused after a restore');

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
  },
);

test.each(['writeSnapshotSet', 'the stage pass'] as const)(
  'it records the staged set with the log head its copy holds, through %s',
  async (entryPoint) => {
    const ctx = await setupTest();
    const forgotten = await ctx.seed.record({ kind: 'memory.forgotten', payload: {} });

    await stageBackupSet(entryPoint, ctx.context, 'forget');

    const rows = await sql`select sequence, kind, state, log_head from backup_sets`.execute(
      ctx.writer.db,
    );

    expect(rows.rows).toStrictEqual([
      { sequence: 1, kind: 'forget', state: 'staged', log_head: forgotten.sequence },
    ]);
  },
);

test.each(['writeSnapshotSet', 'the stage pass'] as const)(
  'it copies a database that holds the rows committed before the set, through %s',
  async (entryPoint) => {
    const ctx = await setupTest();
    const created = await ctx.seed.record({ kind: 'task.created', payload: {} });

    await stageBackupSet(entryPoint, ctx.context, 'scheduled');

    const copy = startDatabase(join(ctx.dataDir, 'backup', '000000000001', 'nixie.db'), {
      readonly: true,
    });

    onTestFinished(() => copy.destroy());

    const rows = await sql`select sequence, kind from records`.execute(copy);

    expect(rows.rows).toStrictEqual([{ sequence: created.sequence, kind: 'task.created' }]);
  },
);

test.each(['writeSnapshotSet', 'the stage pass'] as const)(
  'it numbers a set above the newest set nixie recorded, through %s',
  async (entryPoint) => {
    const ctx = await setupTest();

    await stageBackupSet(entryPoint, ctx.context, 'scheduled');

    // The stage pass refuses while a set waits, so the first set leaves staging before the second.
    await sql`update backup_sets set state = 'published'`.execute(ctx.writer.db);

    const second = await stageBackupSet(entryPoint, ctx.context, 'scheduled');

    expect(second?.sequence).toBe(2);
  },
);

test.each(['writeSnapshotSet', 'the stage pass'] as const)(
  'it numbers a set above a directory in staging that nixie holds no row for, through %s',
  async (entryPoint) => {
    const ctx = await setupTest();

    await mkdir(join(ctx.dataDir, 'backup', '000000000009'), { recursive: true });

    const manifest = await stageBackupSet(entryPoint, ctx.context, 'scheduled');

    expect(manifest?.sequence).toBe(10);
  },
);

test.each(['writeSnapshotSet', 'the stage pass'] as const)(
  'it removes the copies and abandons the set when the copy fails before its marker, through %s',
  async (entryPoint) => {
    const ctx = await setupTest();

    startFaultPointFailure('backup.set.copied');

    await expect(stageBackupSet(entryPoint, ctx.context, 'scheduled')).rejects.toMatchObject({
      message: 'crashed at backup.set.copied',
    });

    const staging = await readdir(join(ctx.dataDir, 'backup'));
    const rows = await sql`select state from backup_sets`.execute(ctx.writer.db);

    expect(staging).toStrictEqual([]);
    expect(rows.rows).toStrictEqual([{ state: 'abandoned' }]);
  },
);

test.each(['writeSnapshotSet', 'the stage pass'] as const)(
  'it removes the copies and abandons the set when the marker write fails, through %s',
  async (entryPoint) => {
    const ctx = await setupTest();

    const context = {
      writer: ctx.writer,
      storage: buildStubFailingStorage(localDataStorage, 'complete', 'write'),
    };

    await expect(stageBackupSet(entryPoint, context, 'scheduled')).rejects.toMatchObject({
      message: 'the stub fails the write of complete',
    });

    const staging = await readdir(join(ctx.dataDir, 'backup'));
    const rows = await sql`select state from backup_sets`.execute(ctx.writer.db);

    expect(staging).toStrictEqual([]);
    expect(rows.rows).toStrictEqual([{ state: 'abandoned' }]);
  },
);

test.each(['writeSnapshotSet', 'the stage pass'] as const)(
  'it keeps a set whose marker exists when a later step fails, for the job may be shipping it, through %s',
  async (entryPoint) => {
    const ctx = await setupTest();

    const context = {
      writer: ctx.writer,
      storage: buildStubFailingStorage(localDataStorage, 'complete', 'fsync'),
    };

    await expect(stageBackupSet(entryPoint, context, 'scheduled')).rejects.toMatchObject({
      message: 'the stub fails the fsync of complete',
    });

    const files = await readdir(join(ctx.dataDir, 'backup', '000000000001'));
    const rows = await sql`select state from backup_sets`.execute(ctx.writer.db);

    expect(files).toIncludeSameMembers(['nixie.db', 'keys.db', 'manifest.json', 'complete']);
    expect(rows.rows).toStrictEqual([{ state: 'staging' }]);
  },
);

test.each(['writeSnapshotSet', 'the stage pass'] as const)(
  'it stages nothing while nixie is paused after a restore, through %s',
  async (entryPoint) => {
    const ctx = await setupTest();

    await withWriteTransaction(ctx.writer, (tx) =>
      pauseNixieInTransaction(tx, ctx.log, {
        cause: 'restore',
        recoveryID: 'recovery-a',
        by: null,
        definitions: { snapshotHash: 'sha256:aa11' },
      }),
    );

    const manifest = await stageBackupSet(entryPoint, ctx.context, 'scheduled');
    const rows = await sql`select sequence from backup_sets`.execute(ctx.writer.db);
    const staged = await readdir(join(ctx.dataDir, 'backup'));

    expect(manifest).toBeNull();
    expect(rows.rows).toStrictEqual([]);
    expect(staged).toStrictEqual([]);
  },
);
