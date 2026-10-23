import { expect, mock, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { claimBackupLock } from './claim-backup-lock';
import { localDataStorage } from './local-data-storage';
import { writeDataBackup } from './write-data-backup';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'nixie-backup-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  const dataDir = join(root, 'data');

  await mkdir(dataDir);

  const log = startDatabase(join(dataDir, 'nixie.db'));

  onTestFinished(() => log.destroy());

  const keys = startDatabase(join(dataDir, 'keys.db'));

  onTestFinished(() => keys.destroy());

  return { dataDir, directory: join(root, 'backup'), log, keys };
}

test('it copies nixie.db and keys.db alone, with the rows still in a live writer WAL, into the directory it names', async () => {
  const ctx = await setupTest();

  await sql`create table items (id text primary key, state text not null)`.execute(ctx.log);
  await sql`insert into items values ('k1', 'active')`.execute(ctx.log);

  await sql`create table record_keys (key_id text primary key, wrapped blob not null)`.execute(
    ctx.keys,
  );

  await sql`insert into record_keys values ('k1', x'00')`.execute(ctx.keys);

  await writeFile(join(ctx.dataDir, 'nixie-schema-6.db'), 'an old copy');
  await mkdir(join(ctx.dataDir, 'run'));

  const onCopied = mock<(file: string) => void>();

  const backup = await writeDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    onCopied,
  });

  const log = startDatabase(join(ctx.directory, 'nixie.db'), { readonly: true });

  onTestFinished(() => log.destroy());

  const keys = startDatabase(join(ctx.directory, 'keys.db'), { readonly: true });

  onTestFinished(() => keys.destroy());

  const files = await readdir(ctx.directory);
  const items = await sql`select id, state from items`.execute(log);
  const recordKeys = await sql`select key_id from record_keys`.execute(keys);

  expect(backup).toStrictEqual({ files: ['nixie.db', 'keys.db'], attempts: 1 });
  expect(files).toIncludeSameMembers(['nixie.db', 'keys.db']);
  expect(items.rows).toStrictEqual([{ id: 'k1', state: 'active' }]);
  expect(recordKeys.rows).toStrictEqual([{ key_id: 'k1' }]);
  expect(onCopied.mock.calls).toStrictEqual([['nixie.db'], ['keys.db']]);
});

test('it copies again when nixie forgets an item and removes its key between the copies, so the keys.db copy holds every key the nixie.db copy needs', async () => {
  const ctx = await setupTest();

  await sql`create table items (id text primary key, state text not null)`.execute(ctx.log);
  await sql`insert into items values ('k1', 'active'), ('k2', 'active')`.execute(ctx.log);

  await sql`create table record_keys (key_id text primary key, wrapped blob not null)`.execute(
    ctx.keys,
  );

  await sql`insert into record_keys values ('k1', x'00'), ('k2', x'00')`.execute(ctx.keys);

  // A delete that finds no row commits nothing, so only the first call changes keys.db.
  const backup = await writeDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    onCopied: async () => {
      await sql`update items set state = 'forgotten' where id = 'k1'`.execute(ctx.log);
      await sql`delete from record_keys where key_id = 'k1'`.execute(ctx.keys);
    },
  });

  const log = startDatabase(join(ctx.directory, 'nixie.db'), { readonly: true });

  onTestFinished(() => log.destroy());

  const keys = startDatabase(join(ctx.directory, 'keys.db'), { readonly: true });

  onTestFinished(() => keys.destroy());

  const items = await sql`select id, state from items order by id`.execute(log);
  const recordKeys = await sql`select key_id from record_keys`.execute(keys);

  expect(backup).toStrictEqual({ files: ['nixie.db', 'keys.db'], attempts: 2 });

  expect(items.rows).toStrictEqual([
    { id: 'k1', state: 'forgotten' },
    { id: 'k2', state: 'active' },
  ]);

  expect(recordKeys.rows).toStrictEqual([{ key_id: 'k2' }]);
});

test('it fails the backup when nixie writes keys.db during each of 5 copies, and leaves no pair a restore takes', async () => {
  const ctx = await setupTest();

  await sql`create table items (id text primary key)`.execute(ctx.log);

  await sql`create table record_keys (key_id text primary key, wrapped blob not null)`.execute(
    ctx.keys,
  );

  const backup = writeDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    onCopied: async () => {
      await sql`insert into record_keys values (${crypto.randomUUID()}, x'00')`.execute(ctx.keys);
    },
  });

  await backup.catch(() => {});

  const files = await readdir(ctx.directory);

  expect(backup).rejects.toThrowWithMessage(Error, 'nixie wrote keys.db during each of 5 copies');
  expect(files).toIncludeSameMembers(['.copying', 'backup-incomplete']);
});

test('it refuses a data directory without keys.db, and copies nothing', async () => {
  const ctx = await setupTest();

  await sql`create table items (id text primary key)`.execute(ctx.log);
  await ctx.keys.destroy();

  await rm(join(ctx.dataDir, 'keys.db'), { force: true });

  const backup = writeDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    onCopied: () => {},
  });

  await backup.catch(() => {});

  expect(backup).rejects.toThrowWithMessage(
    Error,
    `the data directory ${ctx.dataDir} holds no keys.db`,
  );

  expect(existsSync(ctx.directory)).toBeFalse();
});

test('it refuses a directory that exists, and leaves its files alone', async () => {
  const ctx = await setupTest();

  await sql`create table items (id text primary key)`.execute(ctx.log);
  await sql`create table record_keys (key_id text primary key)`.execute(ctx.keys);

  await mkdir(ctx.directory);
  await writeFile(join(ctx.directory, 'nixie.db'), 'an earlier copy');

  const backup = writeDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    onCopied: () => {},
  });

  await backup.catch(() => {});

  const earlier = await Bun.file(join(ctx.directory, 'nixie.db')).text();

  expect(backup).rejects.toThrowWithMessage(
    Error,
    `nixie backs up only into a directory it creates, and ${ctx.directory} exists`,
  );

  expect(earlier).toBe('an earlier copy');
});

test('it lets one of two backups into the same directory copy, and refuses the other before it copies', async () => {
  const ctx = await setupTest();

  await sql`create table items (id text primary key)`.execute(ctx.log);
  await sql`create table record_keys (key_id text primary key)`.execute(ctx.keys);

  const results = await Promise.allSettled([
    writeDataBackup({
      storage: localDataStorage,
      dataDir: ctx.dataDir,
      directory: ctx.directory,
      onCopied: () => {},
    }),
    writeDataBackup({
      storage: localDataStorage,
      dataDir: ctx.dataDir,
      directory: ctx.directory,
      onCopied: () => {},
    }),
  ]);

  const files = await readdir(ctx.directory);

  expect(results).toIncludeSameMembers([
    { status: 'fulfilled', value: { files: ['nixie.db', 'keys.db'], attempts: 1 } },
    {
      status: 'rejected',
      reason: new Error(
        `nixie backs up only into a directory it creates, and ${ctx.directory} exists`,
      ),
    },
  ]);

  expect(files).toIncludeSameMembers(['nixie.db', 'keys.db']);
});

test('it refuses a backup while a restore replaces the databases, and copies nothing', async () => {
  const ctx = await setupTest();

  await sql`create table items (id text primary key)`.execute(ctx.log);
  await sql`create table record_keys (key_id text primary key)`.execute(ctx.keys);

  const restore = await claimBackupLock(localDataStorage, ctx.dataDir, 'exclusive');

  invariant(restore);

  onTestFinished(() => {
    restore.release();
  });

  const backup = await writeDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    onCopied: () => {},
  });

  expect(backup).toStrictEqual({ refused: 'restore-running' });
  expect(existsSync(ctx.directory)).toBeFalse();
});

test('it leaves its directory marked unfinished when it stops before the checked pair is in place', async () => {
  const ctx = await setupTest();

  await sql`create table items (id text primary key)`.execute(ctx.log);
  await sql`create table record_keys (key_id text primary key)`.execute(ctx.keys);

  const backup = writeDataBackup({
    storage: {
      ...localDataStorage,
      files: {
        ...localDataStorage.files,
        renameFile: () =>
          Promise.reject(Object.assign(new Error('EIO: i/o error, rename'), { code: 'EIO' })),
      },
    },
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    onCopied: () => {},
  });

  await backup.catch(() => {});

  const files = await readdir(ctx.directory);

  expect(backup).rejects.toThrowWithMessage(Error, 'EIO: i/o error, rename');
  expect(files).toIncludeSameMembers(['.copying', 'backup-incomplete']);
});

test('it refuses a data directory whose restore stopped before it finished, and copies nothing', async () => {
  const ctx = await setupTest();

  await sql`create table items (id text primary key)`.execute(ctx.log);
  await sql`create table record_keys (key_id text primary key)`.execute(ctx.keys);

  await writeFile(join(ctx.dataDir, 'restore-incomplete'), '');

  const backup = writeDataBackup({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    onCopied: () => {},
  });

  await backup.catch(() => {});

  expect(backup).rejects.toThrowWithMessage(
    Error,
    `a restore of the data directory ${ctx.dataDir} stopped before it finished, so nixie backs up nothing`,
  );

  expect(existsSync(ctx.directory)).toBeFalse();
});
