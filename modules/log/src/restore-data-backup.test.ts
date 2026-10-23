import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import { sql } from 'kysely';
import { claimBackupLock } from './claim-backup-lock';
import { claimWriterLock } from './claim-writer-lock';
import { localDataStorage } from './local-data-storage';
import { restoreDataBackup } from './restore-data-backup';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'nixie-restore-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  const dataDir = join(root, 'data');
  const directory = join(root, 'backup');

  await mkdir(dataDir);
  await mkdir(directory);

  return { dataDir, directory };
}

test('it replaces nixie.db and keys.db with the backup copies, and removes their WAL files', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'nixie.db'), 'the old log');
  await writeFile(join(ctx.dataDir, 'nixie.db-wal'), 'the old log WAL');
  await writeFile(join(ctx.dataDir, 'keys.db-shm'), 'the old key index');
  await writeFile(join(ctx.dataDir, 'keys.db'), 'the old keys');

  const backupLog = startDatabase(join(ctx.directory, 'nixie.db'));

  onTestFinished(() => backupLog.destroy());

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
  });

  const files = await readdir(ctx.dataDir);

  const log = startDatabase(join(ctx.dataDir, 'nixie.db'), { readonly: true });

  onTestFinished(() => log.destroy());

  const keys = startDatabase(join(ctx.dataDir, 'keys.db'), { readonly: true });

  onTestFinished(() => keys.destroy());

  const items = await sql`select id from items`.execute(log);
  const recordKeys = await sql`select key_id from record_keys`.execute(keys);

  expect(restored).toStrictEqual({ files: ['nixie.db', 'keys.db'] });
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

  onTestFinished(() => {
    backup.release();
  });

  const restore = restoreDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
  });

  await restore.catch(() => {});

  const log = await Bun.file(join(ctx.dataDir, 'nixie.db')).text();

  expect(restore).rejects.toThrowWithMessage(
    Error,
    `a backup runs on the data directory ${ctx.dataDir}, so nixie restores nothing`,
  );

  expect(log).toBe('the live log');
});

test('it leaves its restore marker when it stops between the two databases', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dataDir, 'keys.db'));
  await writeFile(join(ctx.dataDir, 'keys.db', 'in the way'), '');

  const backupLog = startDatabase(join(ctx.directory, 'nixie.db'));

  onTestFinished(() => backupLog.destroy());

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
  });

  await restore.catch(() => {});

  const log = await Bun.file(join(ctx.dataDir, 'nixie.db')).text();

  expect(restore).rejects.toThrowWithMessage(Error, 'writer lock held by another process');
  expect(log).toBe('the live log');
});

test('it refuses a backup without keys.db', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'keys.db'), 'the old keys');
  await writeFile(join(ctx.directory, 'nixie.db'), 'a backup log');

  const restore = restoreDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
  });

  await restore.catch(() => {});

  const keys = await Bun.file(join(ctx.dataDir, 'keys.db')).text();

  expect(restore).rejects.toThrowWithMessage(
    Error,
    `the backup in ${ctx.directory} holds no keys.db`,
  );

  expect(keys).toBe('the old keys');
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
