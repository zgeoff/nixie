import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import { sql } from 'kysely';
import { claimWriterLock } from './claim-writer-lock';
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

  const restored = await restoreDataBackup({ dataDir: ctx.dataDir, directory: ctx.directory });
  const files = await readdir(ctx.dataDir);

  const log = startDatabase(join(ctx.dataDir, 'nixie.db'), { readonly: true });

  onTestFinished(() => log.destroy());

  const keys = startDatabase(join(ctx.dataDir, 'keys.db'), { readonly: true });

  onTestFinished(() => keys.destroy());

  const items = await sql`select id from items`.execute(log);
  const recordKeys = await sql`select key_id from record_keys`.execute(keys);

  expect(restored).toStrictEqual({ files: ['nixie.db', 'keys.db'] });
  expect(files).toIncludeSameMembers(['nixie.db', 'keys.db']);
  expect(items.rows).toStrictEqual([{ id: 'k1' }]);
  expect(recordKeys.rows).toStrictEqual([{ key_id: 'k1' }]);
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

  const restore = restoreDataBackup({ dataDir: ctx.dataDir, directory: ctx.directory });

  await restore.catch(() => {});

  const log = await Bun.file(join(ctx.dataDir, 'nixie.db')).text();

  expect(restore).rejects.toThrowWithMessage(Error, 'writer lock held by another process');
  expect(log).toBe('the live log');
});

test('it refuses a backup without keys.db', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'keys.db'), 'the old keys');
  await writeFile(join(ctx.directory, 'nixie.db'), 'a backup log');

  const restore = restoreDataBackup({ dataDir: ctx.dataDir, directory: ctx.directory });

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

  const restore = restoreDataBackup({ dataDir: ctx.dataDir, directory: ctx.directory });

  await restore.catch(() => {});

  const files = await readdir(ctx.dataDir);
  const log = await Bun.file(join(ctx.dataDir, 'nixie.db')).text();

  expect(restore).rejects.toThrowWithMessage(
    Error,
    `the nixie.db in ${ctx.directory} fails its integrity check: file is not a database`,
  );

  expect(files).toStrictEqual(['nixie.db']);
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

  const restore = restoreDataBackup({ dataDir: ctx.dataDir, directory: ctx.directory });

  await restore.catch(() => {});

  const files = await readdir(ctx.dataDir);
  const log = await Bun.file(join(ctx.dataDir, 'nixie.db')).text();

  expect(restore).rejects.toThrowWithMessage(
    Error,
    `nixie cannot stage the backup in ${ctx.dataDir}`,
  );

  expect(files).toStrictEqual(['nixie.db']);
  expect(log).toBe('the old log');
});
