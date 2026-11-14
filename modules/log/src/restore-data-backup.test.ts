import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimFileLock } from '@heynixie/async';
import { startDatabase } from '@heynixie/db';
import { formatBackupFile, getBackupSetDir, restoreNoteSchema } from '@heynixie/wire';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { claimBackupLock } from './claim-backup-lock';
import { claimWriterLock } from './claim-writer-lock';
import { localDataStorage } from './local-data-storage';
import { restoreDataBackup } from './restore-data-backup';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'nixie-restore-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  const dataDir = join(root, 'data');
  const directory = join(root, 'backup');
  const stagingDir = join(root, 'staging');

  await mkdir(dataDir);
  await mkdir(directory);

  const writeBackupDatabases = async (): Promise<void> => {
    const backupLog = startDatabase(join(directory, 'nixie.db'));

    onTestFinished(() => backupLog.destroy());

    await sql`create table schema_version (id integer primary key)`.execute(backupLog);
    await sql`create table records (record_id text primary key)`.execute(backupLog);
    await backupLog.destroy();

    const backupKeys = startDatabase(join(directory, 'keys.db'));

    onTestFinished(() => backupKeys.destroy());

    await sql`create table record_keys (key_id text primary key)`.execute(backupKeys);
    await backupKeys.destroy();
  };

  return {
    dataDir,
    directory,
    stagingDir,
    clock: { now: () => 1_700_000_000_000 },
    writeBackupDatabases,
  };
}

test('it replaces nixie.db and keys.db with the backup copies, and removes their WAL files', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'nixie.db'), 'the old log');
  await writeFile(join(ctx.dataDir, 'nixie.db-wal'), 'the old log WAL');
  await writeFile(join(ctx.dataDir, 'keys.db-shm'), 'the old key index');
  await writeFile(join(ctx.dataDir, 'keys.db'), 'the old keys');

  const backupLog = startDatabase(join(ctx.directory, 'nixie.db'));

  onTestFinished(() => backupLog.destroy());

  await sql`create table schema_version (id integer primary key)`.execute(backupLog);
  await sql`create table records (record_id text primary key)`.execute(backupLog);
  await sql`create table items (id text primary key)`.execute(backupLog);
  await sql`insert into items values ('k1')`.execute(backupLog);
  await backupLog.destroy();

  const backupKeys = startDatabase(join(ctx.directory, 'keys.db'));

  onTestFinished(() => backupKeys.destroy());

  await sql`create table record_keys (key_id text primary key)`.execute(backupKeys);
  await sql`insert into record_keys values ('k1')`.execute(backupKeys);
  await backupKeys.destroy();

  const restored = await restoreDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    stagingDir: ctx.stagingDir,
    clock: ctx.clock,
  });

  const files = await readdir(ctx.dataDir);

  const log = startDatabase(join(ctx.dataDir, 'nixie.db'), { readonly: true });

  onTestFinished(() => log.destroy());

  const keys = startDatabase(join(ctx.dataDir, 'keys.db'), { readonly: true });

  onTestFinished(() => keys.destroy());

  const items = await sql`select id from items`.execute(log);
  const recordKeys = await sql`select key_id from record_keys`.execute(keys);

  expect(restored).toStrictEqual({ files: ['nixie.db', 'keys.db'], pair: null });
  expect(files).toIncludeSameMembers(['nixie.db', 'keys.db', 'backup.lock']);
  expect(items.rows).toStrictEqual([{ id: 'k1' }]);
  expect(recordKeys.rows).toStrictEqual([{ key_id: 'k1' }]);
});

test('it refuses a restore while a backup reads the data directory, and leaves it alone', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'nixie.db'), 'the live log');
  await writeFile(join(ctx.directory, 'nixie.db'), 'a backup log');
  await writeFile(join(ctx.directory, 'keys.db'), 'backup keys');

  const backup = await claimBackupLock(localDataStorage, ctx.dataDir, 'shared');

  invariant(backup);

  onTestFinished(() => {
    backup.release();
  });

  const restore = await restoreDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    stagingDir: ctx.stagingDir,
    clock: ctx.clock,
  });

  const log = await Bun.file(join(ctx.dataDir, 'nixie.db')).text();

  expect(restore).toStrictEqual({ refused: 'backup-running' });
  expect(log).toBe('the live log');
});

test('it leaves its restore marker when it stops between the two databases', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dataDir, 'keys.db'));
  await writeFile(join(ctx.dataDir, 'keys.db', 'in the way'), '');

  const backupLog = startDatabase(join(ctx.directory, 'nixie.db'));

  onTestFinished(() => backupLog.destroy());

  await sql`create table schema_version (id integer primary key)`.execute(backupLog);
  await sql`create table records (record_id text primary key)`.execute(backupLog);
  await sql`create table items (id text primary key)`.execute(backupLog);
  await backupLog.destroy();

  const backupKeys = startDatabase(join(ctx.directory, 'keys.db'));

  onTestFinished(() => backupKeys.destroy());

  await sql`create table record_keys (key_id text primary key)`.execute(backupKeys);
  await backupKeys.destroy();

  const restore = restoreDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    stagingDir: ctx.stagingDir,
    clock: ctx.clock,
  });

  await restore.catch(() => {});

  const files = await readdir(ctx.dataDir);

  expect(restore).rejects.toMatchObject({ code: 'EISDIR' });
  expect(files).toIncludeAllMembers(['nixie.db', 'restore-incomplete']);
});

test('it refuses a restore while a server holds the writer lock, and leaves the data directory alone', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'nixie.db'), 'the live log');
  await writeFile(join(ctx.directory, 'nixie.db'), 'a backup log');
  await writeFile(join(ctx.directory, 'keys.db'), 'backup keys');

  const lock = claimWriterLock(ctx.dataDir);

  onTestFinished(() => {
    lock.release();
  });

  const restore = restoreDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    stagingDir: ctx.stagingDir,
    clock: ctx.clock,
  });

  await restore.catch(() => {});

  const log = await Bun.file(join(ctx.dataDir, 'nixie.db')).text();

  expect(restore).rejects.toThrowWithMessage(Error, 'writer lock held by another process');
  expect(log).toBe('the live log');
});

test('it refuses a backup that stopped mid-retry with a new nixie.db beside an old keys.db, and leaves the data directory alone', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'nixie.db'), 'the live log');
  await writeFile(join(ctx.dataDir, 'keys.db'), 'the live keys');
  await writeFile(join(ctx.directory, 'backup-incomplete'), '');

  const backupLog = startDatabase(join(ctx.directory, 'nixie.db'));

  onTestFinished(() => backupLog.destroy());

  await sql`create table schema_version (id integer primary key)`.execute(backupLog);
  await sql`create table records (record_id text primary key)`.execute(backupLog);
  await sql`create table items (id text primary key)`.execute(backupLog);
  await sql`insert into items values ('k1'), ('k2')`.execute(backupLog);
  await backupLog.destroy();

  const backupKeys = startDatabase(join(ctx.directory, 'keys.db'));

  onTestFinished(() => backupKeys.destroy());

  await sql`create table record_keys (key_id text primary key)`.execute(backupKeys);
  await sql`insert into record_keys values ('k1')`.execute(backupKeys);
  await backupKeys.destroy();

  const restore = restoreDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    stagingDir: ctx.stagingDir,
    clock: ctx.clock,
  });

  await restore.catch(() => {});

  const log = await Bun.file(join(ctx.dataDir, 'nixie.db')).text();
  const keys = await Bun.file(join(ctx.dataDir, 'keys.db')).text();

  expect(restore).rejects.toThrowWithMessage(
    Error,
    `the backup in ${ctx.directory} stopped before it finished, so nixie restores nothing`,
  );

  expect(log).toBe('the live log');
  expect(keys).toBe('the live keys');
});

test('it refuses a backup without keys.db', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'keys.db'), 'the old keys');
  await writeFile(join(ctx.directory, 'nixie.db'), 'a backup log');

  const restore = restoreDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    stagingDir: ctx.stagingDir,
    clock: ctx.clock,
  });

  await restore.catch(() => {});

  const keys = await Bun.file(join(ctx.dataDir, 'keys.db')).text();

  expect(restore).rejects.toThrowWithMessage(
    Error,
    `the backup in ${ctx.directory} holds no keys.db`,
  );

  expect(keys).toBe('the old keys');
});

test('it refuses a backup whose keys.db is an empty file, before it replaces anything', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'nixie.db'), 'the live log');
  await writeFile(join(ctx.dataDir, 'keys.db'), 'the live keys');
  await writeFile(join(ctx.directory, 'keys.db'), '');

  const backupLog = startDatabase(join(ctx.directory, 'nixie.db'));

  onTestFinished(() => backupLog.destroy());

  await sql`create table schema_version (id integer primary key)`.execute(backupLog);
  await sql`create table records (record_id text primary key)`.execute(backupLog);
  await backupLog.destroy();

  const restore = restoreDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    stagingDir: ctx.stagingDir,
    clock: ctx.clock,
  });

  await restore.catch(() => {});

  const log = await Bun.file(join(ctx.dataDir, 'nixie.db')).text();
  const keys = await Bun.file(join(ctx.dataDir, 'keys.db')).text();

  expect(restore).rejects.toThrowWithMessage(
    Error,
    `the keys.db in ${ctx.directory} holds no record_keys table, so it is not a nixie backup`,
  );

  expect(log).toBe('the live log');
  expect(keys).toBe('the live keys');
});

test('it refuses a backup whose nixie.db holds no event log, before it replaces anything', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'nixie.db'), 'the live log');
  await writeFile(join(ctx.dataDir, 'keys.db'), 'the live keys');
  await writeFile(join(ctx.directory, 'nixie.db'), '');

  const backupKeys = startDatabase(join(ctx.directory, 'keys.db'));

  onTestFinished(() => backupKeys.destroy());

  await sql`create table record_keys (key_id text primary key)`.execute(backupKeys);
  await backupKeys.destroy();

  const restore = restoreDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    stagingDir: ctx.stagingDir,
    clock: ctx.clock,
  });

  await restore.catch(() => {});

  const log = await Bun.file(join(ctx.dataDir, 'nixie.db')).text();

  expect(restore).rejects.toThrowWithMessage(
    Error,
    `the nixie.db in ${ctx.directory} holds no schema_version or records table, so it is not a nixie backup`,
  );

  expect(log).toBe('the live log');
});

test('it refuses a backup whose nixie.db is not a database, before it replaces anything', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'nixie.db'), 'the old log');
  await writeFile(join(ctx.directory, 'nixie.db'), 'no SQLite header here');

  const backupKeys = startDatabase(join(ctx.directory, 'keys.db'));

  onTestFinished(() => backupKeys.destroy());

  await sql`create table record_keys (key_id text primary key)`.execute(backupKeys);
  await backupKeys.destroy();

  const restore = restoreDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    stagingDir: ctx.stagingDir,
    clock: ctx.clock,
  });

  await restore.catch(() => {});

  const files = await readdir(ctx.dataDir);
  const log = await Bun.file(join(ctx.dataDir, 'nixie.db')).text();

  expect(restore).rejects.toThrowWithMessage(
    Error,
    `the nixie.db in ${ctx.directory} fails its integrity check: file is not a database`,
  );

  expect(files).toIncludeSameMembers(['nixie.db', 'backup.lock']);
  expect(log).toBe('the old log');
});

test('it removes its staged copies and keeps the old databases when it cannot stage the backup', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'nixie.db'), 'the old log');
  await mkdir(join(ctx.dataDir, 'keys.db.restoring'));

  const backupLog = startDatabase(join(ctx.directory, 'nixie.db'));

  onTestFinished(() => backupLog.destroy());

  await sql`create table schema_version (id integer primary key)`.execute(backupLog);
  await sql`create table records (record_id text primary key)`.execute(backupLog);
  await sql`create table items (id text primary key)`.execute(backupLog);
  await backupLog.destroy();

  const backupKeys = startDatabase(join(ctx.directory, 'keys.db'));

  onTestFinished(() => backupKeys.destroy());

  await sql`create table record_keys (key_id text primary key)`.execute(backupKeys);
  await backupKeys.destroy();

  const restore = restoreDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    stagingDir: ctx.stagingDir,
    clock: ctx.clock,
  });

  await restore.catch(() => {});

  const files = await readdir(ctx.dataDir);
  const log = await Bun.file(join(ctx.dataDir, 'nixie.db')).text();

  expect(restore).rejects.toThrowWithMessage(
    Error,
    `nixie cannot stage the backup in ${ctx.dataDir}: EISDIR: illegal operation on a directory, copyfile '${join(ctx.directory, 'keys.db')}' -> '${join(ctx.dataDir, 'keys.db.restoring')}'`,
  );

  expect(files).toIncludeSameMembers(['nixie.db', 'backup.lock']);
  expect(log).toBe('the old log');
});

test('it keeps the old databases when the data volume is full', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'nixie.db'), 'the old log');
  await writeFile(join(ctx.dataDir, 'keys.db'), 'the old keys');

  const backupLog = startDatabase(join(ctx.directory, 'nixie.db'));

  onTestFinished(() => backupLog.destroy());

  await sql`create table schema_version (id integer primary key)`.execute(backupLog);
  await sql`create table records (record_id text primary key)`.execute(backupLog);
  await sql`create table items (id text primary key)`.execute(backupLog);
  await backupLog.destroy();

  const backupKeys = startDatabase(join(ctx.directory, 'keys.db'));

  onTestFinished(() => backupKeys.destroy());

  await sql`create table record_keys (key_id text primary key)`.execute(backupKeys);
  await backupKeys.destroy();

  const restore = restoreDataBackup({
    storage: {
      ...localDataStorage,
      files: {
        ...localDataStorage.files,
        copyFile: () =>
          Promise.reject(
            Object.assign(new Error('ENOSPC: no space left on device, copyfile'), {
              code: 'ENOSPC',
            }),
          ),
      },
    },
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    stagingDir: ctx.stagingDir,
    clock: ctx.clock,
  });

  await restore.catch(() => {});

  const files = await readdir(ctx.dataDir);
  const log = await Bun.file(join(ctx.dataDir, 'nixie.db')).text();
  const keys = await Bun.file(join(ctx.dataDir, 'keys.db')).text();

  expect(restore).rejects.toThrowWithMessage(
    Error,
    `nixie cannot stage the backup in ${ctx.dataDir}: ENOSPC: no space left on device, copyfile`,
  );

  expect(files).toIncludeSameMembers(['nixie.db', 'keys.db', 'backup.lock']);
  expect(log).toBe('the old log');
  expect(keys).toBe('the old keys');
});

test('it finishes the restore again after one that stopped between the two databases, and removes its marker', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'restore-incomplete'), '');
  await writeFile(join(ctx.dataDir, 'keys.db'), 'the old keys');

  const backupLog = startDatabase(join(ctx.directory, 'nixie.db'));

  onTestFinished(() => backupLog.destroy());

  await sql`create table schema_version (id integer primary key)`.execute(backupLog);
  await sql`create table records (record_id text primary key)`.execute(backupLog);
  await sql`create table items (id text primary key)`.execute(backupLog);
  await backupLog.destroy();

  const backupKeys = startDatabase(join(ctx.directory, 'keys.db'));

  onTestFinished(() => backupKeys.destroy());

  await sql`create table record_keys (key_id text primary key)`.execute(backupKeys);
  await sql`insert into record_keys values ('k1')`.execute(backupKeys);
  await backupKeys.destroy();

  await restoreDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    stagingDir: ctx.stagingDir,
    clock: ctx.clock,
  });

  const files = await readdir(ctx.dataDir);

  const keys = startDatabase(join(ctx.dataDir, 'keys.db'), { readonly: true });

  onTestFinished(() => keys.destroy());

  const recordKeys = await sql`select key_id from record_keys`.execute(keys);

  expect(files).toIncludeSameMembers(['nixie.db', 'keys.db', 'backup.lock']);
  expect(recordKeys.rows).toStrictEqual([{ key_id: 'k1' }]);
});

test('it replaces neither database when its restore marker cannot reach the disk', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'nixie.db'), 'the old log');
  await writeFile(join(ctx.dataDir, 'keys.db'), 'the old keys');

  const backupLog = startDatabase(join(ctx.directory, 'nixie.db'));

  onTestFinished(() => backupLog.destroy());

  await sql`create table schema_version (id integer primary key)`.execute(backupLog);
  await sql`create table records (record_id text primary key)`.execute(backupLog);
  await sql`create table items (id text primary key)`.execute(backupLog);
  await backupLog.destroy();

  const backupKeys = startDatabase(join(ctx.directory, 'keys.db'));

  onTestFinished(() => backupKeys.destroy());

  await sql`create table record_keys (key_id text primary key)`.execute(backupKeys);
  await backupKeys.destroy();

  const restore = restoreDataBackup({
    storage: {
      ...localDataStorage,
      files: {
        ...localDataStorage.files,
        writeDirectoryToDisk: () =>
          Promise.reject(Object.assign(new Error('EIO: i/o error, fsync'), { code: 'EIO' })),
      },
    },
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    stagingDir: ctx.stagingDir,
    clock: ctx.clock,
  });

  await restore.catch(() => {});

  const log = await Bun.file(join(ctx.dataDir, 'nixie.db')).text();
  const keys = await Bun.file(join(ctx.dataDir, 'keys.db')).text();

  expect(restore).rejects.toThrowWithMessage(Error, 'EIO: i/o error, fsync');
  expect(log).toBe('the old log');
  expect(keys).toBe('the old keys');
});

test('it refuses a pair file that does not parse, and changes nothing', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'nixie.db'), 'the live log');
  await writeFile(join(ctx.dataDir, 'keys.db'), 'the live keys');
  await mkdir(getBackupSetDir(ctx.stagingDir, 1), { recursive: true });

  await ctx.writeBackupDatabases();

  await writeFile(join(ctx.directory, 'fetched-pair.json'), '{"format":2}');

  const restore = restoreDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    stagingDir: ctx.stagingDir,
    clock: ctx.clock,
  });

  await restore.catch(() => {});

  const log = await Bun.file(join(ctx.dataDir, 'nixie.db')).text();
  const dataFiles = await readdir(ctx.dataDir);
  const staging = await readdir(ctx.stagingDir);

  expect(restore).rejects.toThrowWithMessage(
    Error,
    /the fetched-pair.json in .* does not parse .*, so nixie restores nothing/u,
  );

  expect(log).toBe('the live log');
  expect(dataFiles).toIncludeSameMembers(['nixie.db', 'keys.db', 'backup.lock']);
  expect(staging).toStrictEqual(['000000000001']);
});

test('it empties staging of its sets, writes the restore note, and returns the pair', async () => {
  const ctx = await setupTest();

  await ctx.writeBackupDatabases();

  await writeFile(
    join(ctx.directory, 'fetched-pair.json'),
    formatBackupFile({
      format: 1,
      fetchedAt: 1_700_000_000_000,
      key: { snapshotID: 'a'.repeat(64), publish: 2, set: 5, writtenAt: 1_700_000_000_000 },
      data: { snapshotID: 'b'.repeat(64), publish: 2, set: 4, writtenAt: 1_700_000_000_000 },
      relation: 'older-data',
    }),
  );

  await mkdir(getBackupSetDir(ctx.stagingDir, 1), { recursive: true });
  await writeFile(join(getBackupSetDir(ctx.stagingDir, 1), 'complete'), '');
  await mkdir(getBackupSetDir(ctx.stagingDir, 2), { recursive: true });
  await writeFile(join(ctx.stagingDir, 'job.lock'), '');

  const options = {
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    stagingDir: ctx.stagingDir,
    clock: ctx.clock,
  };

  const restored = await restoreDataBackup(options);
  const staging = await readdir(ctx.stagingDir);
  const noteText = await Bun.file(join(ctx.stagingDir, 'restore-note.json')).text();
  const dataFiles = await readdir(ctx.dataDir);

  await restoreDataBackup(options);

  const secondNoteText = await Bun.file(join(ctx.stagingDir, 'restore-note.json')).text();
  const secondStaging = await readdir(ctx.stagingDir);

  expect(restored).toMatchObject({ pair: { relation: 'older-data' } });
  expect(staging).toIncludeSameMembers(['job.lock', 'restore-note.json']);

  expect(restoreNoteSchema.parse(JSON.parse(noteText))).toStrictEqual({
    format: 1,
    restoredAt: 1_700_000_000_000,
    keySnapshotID: 'a'.repeat(64),
  });

  expect(dataFiles).not.toContain('restore-incomplete');
  expect(secondNoteText).toBe(noteText);
  expect(secondStaging).toIncludeSameMembers(['job.lock', 'restore-note.json']);
});

test('it fails with the restore marker in place when a backup job pass holds the staging lock', async () => {
  const ctx = await setupTest();

  await ctx.writeBackupDatabases();

  await mkdir(getBackupSetDir(ctx.stagingDir, 1), { recursive: true });
  await writeFile(join(ctx.stagingDir, 'job.lock'), '');

  const lock = claimFileLock(join(ctx.stagingDir, 'job.lock'), 'exclusive');

  invariant(lock);

  onTestFinished(() => {
    lock.release();
  });

  const restore = restoreDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    stagingDir: ctx.stagingDir,
    clock: ctx.clock,
  });

  await restore.catch(() => {});

  const dataFiles = await readdir(ctx.dataDir);
  const staging = await readdir(ctx.stagingDir);

  const log = startDatabase(join(ctx.dataDir, 'nixie.db'), { readonly: true });

  onTestFinished(() => log.destroy());

  const tables = await sql`select name from sqlite_schema where name = 'records'`.execute(log);

  expect(restore).rejects.toThrowWithMessage(Error, /a backup job pass holds the staging lock/u);
  expect(tables.rows).toStrictEqual([{ name: 'records' }]);
  expect(dataFiles).toContain('restore-incomplete');
  expect(staging).toIncludeSameMembers(['job.lock', '000000000001']);
});

test('it writes a note with no key snapshot for a directory without a pair file', async () => {
  const ctx = await setupTest();

  await ctx.writeBackupDatabases();

  const restored = await restoreDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    stagingDir: ctx.stagingDir,
    clock: ctx.clock,
  });

  const note = await Bun.file(join(ctx.stagingDir, 'restore-note.json')).text();

  expect(restored).toStrictEqual({ files: ['nixie.db', 'keys.db'], pair: null });

  expect(note).toBe(
    formatBackupFile({ format: 1, restoredAt: 1_700_000_000_000, keySnapshotID: null }),
  );
});
