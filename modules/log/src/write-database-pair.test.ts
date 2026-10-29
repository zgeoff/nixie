import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import { sql } from 'kysely';
import { localDataStorage } from './local-data-storage';
import { writeDatabasePair } from './write-database-pair';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'nixie-pair-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  const dataDir = join(root, 'data');
  const directory = join(root, 'set');

  await mkdir(dataDir);
  await mkdir(directory);

  const log = startDatabase(join(dataDir, 'nixie.db'));

  onTestFinished(() => log.destroy());

  const keys = startDatabase(join(dataDir, 'keys.db'));

  onTestFinished(() => keys.destroy());

  return { dataDir, directory, log, keys };
}

test('it copies both databases into an existing directory, in one copy when keys.db stays still', async () => {
  const ctx = await setupTest();

  await sql`create table items (id text primary key)`.execute(ctx.log);
  await sql`create table record_keys (key_id text primary key)`.execute(ctx.keys);

  const attempts = await writeDatabasePair({
    storage: localDataStorage,
    dataDir: ctx.dataDir,
    directory: ctx.directory,
    onCopied: () => {},
  });

  const files = await readdir(ctx.directory);

  expect(attempts).toBe(1);
  expect(files).toIncludeSameMembers(['nixie.db', 'keys.db']);
});
