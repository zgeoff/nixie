// oxlint-disable no-await-in-loop, max-statements, max-lines-per-function, one-var, sort-vars
// Crypto-shredding of memory items: backups, the key store's raw bytes, a persisted FTS5 index,
// timings and undo. Usage: bun shred.ts (writes only under a fresh temporary directory).
import { Database } from 'bun:sqlite';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDeploymentKey, decodeItemKey } from './crypto.ts';
import type { Stores } from './store.ts';
import {
  createDb,
  createItem,
  createKeyStore,
  getWrappedKey,
  readCurrent,
  readHistory,
  removeItemKey,
  writeNextVersion,
} from './store.ts';

const ITEMS = 300,
  VERSIONS = 3,
  dir = mkdtempSync(join(tmpdir(), 'memory-shred-'));

function getMarker(index: number): string {
  return `zqmarker${String(index).padStart(5, '0')}`;
}

function buildVersions(index: number): string[] {
  return Array.from(
    { length: VERSIONS },
    (_, v) => `The owner's dentist is Dr ${getMarker(index)} on Harbour Street, version ${v + 1}.`,
  );
}

function getElapsedMs(start: number): number {
  return Number((performance.now() - start).toFixed(1));
}

// True when the bytes appear anywhere in the file or its WAL.
interface Hit {
  file: boolean;
  wal: boolean;
}

function formatHit(hit: Hit): string {
  return `file=${hit.file} wal=${hit.wal}`;
}

function findBytes(path: string, needle: Uint8Array | string): Hit {
  const has = (p: string) => existsSync(p) && readFileSync(p).includes(Buffer.from(needle));
  return { file: has(path), wal: has(`${path}-wal`) };
}

async function createItems(stores: Stores, count: number, offset = 0): Promise<number> {
  const start = performance.now();
  for (let index = offset; index < offset + count; index += 1) {
    await createItem(stores, `item-${index}`, buildVersions(index));
  }
  return getElapsedMs(start);
}

async function readAll(stores: Stores, count: number): Promise<number> {
  const start = performance.now();
  for (let index = 0; index < count; index += 1) {
    await readCurrent(stores, `item-${index}`);
  }
  return getElapsedMs(start);
}

async function checkBackups(): Promise<void> {
  const stores: Stores = {
      db: createDb(join(dir, 'memory.db')),
      deploymentKey: await createDeploymentKey(),
      keys: createKeyStore(join(dir, 'keys.db'), true),
    },
    target = 'item-42',
    writeMs = await createItems(stores, ITEMS),
    readMs = await readAll(stores, ITEMS);
  console.log(
    `1. ${ITEMS} items x ${VERSIONS} versions: write ${writeMs} ms, decrypt all ${readMs} ms`,
  );
  console.log(
    `   records: ${(stores.db.query('SELECT count(*) AS n FROM records').get() as { n: number }).n}`,
  );

  stores.db.run(`VACUUM INTO '${join(dir, 'memory-backup.db')}'`);
  stores.keys.run(`VACUUM INTO '${join(dir, 'keys-backup.db')}'`);
  removeItemKey(stores.keys, target);

  const backupDb = createDb(join(dir, 'memory-backup.db')),
    oldKeys = new Database(join(dir, 'keys-backup.db')),
    live = await readCurrent(stores, target),
    fromBackupWithCurrentKeys = await readCurrent({ ...stores, db: backupDb }, target),
    fromBackupWithOldKeys = await readCurrent({ ...stores, db: backupDb, keys: oldKeys }, target),
    envelopes = stores.db.query('SELECT kind, version FROM records WHERE item_id = ?').all(target);
  console.log('2. forget item-42');
  console.log(`   live db, current keys: ${live ?? 'unreadable'}`);
  console.log(`   db backup, current keys: ${fromBackupWithCurrentKeys ?? 'unreadable'}`);
  console.log(
    `   db backup, key backup taken before forget: ${fromBackupWithOldKeys ?? 'unreadable'}`,
  );
  oldKeys.close();
  rmSync(join(dir, 'keys-backup.db'));
  stores.keys.run(`VACUUM INTO '${join(dir, 'keys-backup.db')}'`);
  const newKeys = new Database(join(dir, 'keys-backup.db')),
    afterReplace = await readCurrent({ ...stores, db: backupDb, keys: newKeys }, target);
  console.log(`   db backup, key backup replaced after forget: ${afterReplace ?? 'unreadable'}`);
  console.log(`   envelopes left for item-42: ${JSON.stringify(envelopes)}`);
  const neighbour = await readCurrent(stores, 'item-43');
  console.log(`   item-43 still reads: ${neighbour?.slice(0, 40)}`);

  stores.db.run('PRAGMA wal_checkpoint(TRUNCATE)');
  const files = ['memory.db', 'memory-backup.db', 'keys.db', 'keys-backup.db'].map((name) => {
    const hit = findBytes(join(dir, name), 'zqmarker');
    return `${name} ${hit.file || hit.wal ? 'HAS' : 'no'} plaintext`;
  });
  console.log(`   plaintext marker: ${files.join(', ')}`);

  console.log('5. undo and history');
  const undoVersion = await writeNextVersion(stores, 'item-7', buildVersions(7)[1] ?? ''),
    history = await readHistory(stores, 'item-7'),
    forgotten = await readHistory(stores, target);
  console.log(
    `   item-7 undo wrote version ${undoVersion}; history reads ${history.length} versions`,
  );
  console.log(
    `   item-42 history: ${forgotten.length} rows, ${forgotten.filter((t) => t === undefined).length} unreadable`,
  );
  newKeys.close();
  backupDb.close();
  stores.db.close();
  stores.keys.close();
}

async function checkKeyStoreBytes(secureDelete: boolean): Promise<void> {
  const path = join(dir, `keys-${secureDelete ? 'secure' : 'plain'}.db`),
    stores: Stores = {
      db: createDb(join(dir, `scratch-${secureDelete ? 'secure' : 'plain'}.db`)),
      deploymentKey: await createDeploymentKey(),
      keys: createKeyStore(path, secureDelete),
    };
  await createItems(stores, ITEMS);
  stores.keys.run('PRAGMA wal_checkpoint(TRUNCATE)');
  const wrapped = getWrappedKey(stores.keys, 'item-42') ?? new Uint8Array(),
    before = findBytes(path, wrapped);
  removeItemKey(stores.keys, 'item-42');
  const afterDelete = findBytes(path, wrapped);
  stores.keys.run('PRAGMA wal_checkpoint(TRUNCATE)');
  const afterCheckpoint = findBytes(path, wrapped);
  stores.keys.run('VACUUM');
  stores.keys.run('PRAGMA wal_checkpoint(TRUNCATE)');
  const afterVacuum = findBytes(path, wrapped);
  console.log(
    `3. key store, secure_delete ${secureDelete ? 'ON' : 'OFF'}: wrapped key bytes found`,
  );
  console.log(`   before forget: ${formatHit(before)}`);
  console.log(`   after delete: ${formatHit(afterDelete)}`);
  console.log(`   after checkpoint: ${formatHit(afterCheckpoint)}`);
  console.log(`   after VACUUM: ${formatHit(afterVacuum)}`);
  stores.db.close();
  stores.keys.close();
}

function checkFts(mode: string): void {
  const path = join(dir, `fts-${mode}.db`),
    db = new Database(path, { create: true });
  db.run('PRAGMA journal_mode = WAL');
  if (mode === 'secure_delete pragma' || mode === 'fts5 secure-delete and pragma') {
    db.run('PRAGMA secure_delete = ON');
  }
  db.run('CREATE VIRTUAL TABLE notes USING fts5(body)');
  if (mode.startsWith('fts5 secure-delete')) {
    db.run("INSERT INTO notes (notes, rank) VALUES ('secure-delete', 1)");
  }
  const insert = db.query('INSERT INTO notes (rowid, body) VALUES (?, ?)');
  db.transaction(() => {
    for (let index = 0; index < ITEMS; index += 1) {
      insert.run(index + 1, buildVersions(index)[0] ?? '');
    }
  })();
  db.run('PRAGMA wal_checkpoint(TRUNCATE)');
  db.run('DELETE FROM notes WHERE rowid = 43');
  if (mode === 'optimize') {
    db.run("INSERT INTO notes (notes) VALUES ('optimize')");
  }
  if (mode === 'rebuild') {
    db.run("INSERT INTO notes (notes) VALUES ('rebuild')");
  }
  db.run('PRAGMA wal_checkpoint(TRUNCATE)');
  const hit = findBytes(path, getMarker(42)),
    query = db.query('SELECT count(*) AS n FROM notes WHERE notes MATCH ?').get(getMarker(42)) as {
      n: number;
    };
  db.run('VACUUM');
  db.run('PRAGMA wal_checkpoint(TRUNCATE)');
  const afterVacuum = findBytes(path, getMarker(42));
  console.log(
    `   ${mode}: query finds ${query.n}; bytes in file=${hit.file}; after VACUUM file=${afterVacuum.file}`,
  );
  db.close();
}

async function checkTimings(): Promise<void> {
  const count = 10_000,
    stores: Stores = {
      db: createDb(join(dir, 'scale.db')),
      deploymentKey: await createDeploymentKey(),
      keys: createKeyStore(join(dir, 'keys-scale.db'), true),
    },
    writeMs = await createItems(stores, count),
    readMs = await readAll(stores, count),
    parallelStart = performance.now();
  await Promise.all(
    Array.from({ length: count }, (_, index) => readCurrent(stores, `item-${index}`)),
  );
  const parallelMs = getElapsedMs(parallelStart),
    wrapped = getWrappedKey(stores.keys, 'item-1') ?? new Uint8Array(),
    start = performance.now();
  for (let index = 0; index < 1000; index += 1) {
    await decodeItemKey(wrapped, stores.deploymentKey);
  }
  const unwrapUs = Number((((performance.now() - start) / 1000) * 1000).toFixed(1));
  console.log(
    `4. ${count} items x ${VERSIONS} versions: write ${writeMs} ms, decrypt all ${readMs} ms`,
  );
  console.log(`   decrypt all at once with Promise.all: ${parallelMs} ms`);
  console.log(`   key unwrap: ${unwrapUs} µs per item`);
  stores.db.close();
  stores.keys.close();
}

console.log(
  `bun ${Bun.version}, SQLite ${(new Database(':memory:').query('SELECT sqlite_version() AS v').get() as { v: string }).v}`,
);
await checkBackups();
await checkKeyStoreBytes(false);
await checkKeyStoreBytes(true);
console.log('3. persisted FTS5 over plaintext, row for item-42 deleted: forgotten word');
for (const mode of [
  'default',
  'secure_delete pragma',
  'fts5 secure-delete',
  'fts5 secure-delete and pragma',
  'optimize',
  'rebuild',
]) {
  checkFts(mode);
}
await checkTimings();
rmSync(dir, { force: true, recursive: true });
