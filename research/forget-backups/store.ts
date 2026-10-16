/* oxlint-disable no-await-in-loop, one-var, sort-vars -- writes run one item after another */
// A memory database that holds only ciphertext, and a key store in a separate file.
import { Database } from 'bun:sqlite';
import type { Sealed } from './crypto.ts';
import { createItemKey, decodeItemKey, decodeText, encodeItemKey, encodeText } from './crypto.ts';

export interface Stores {
  db: Database;
  keys: Database;
  deploymentKey: CryptoKey;
}

interface VersionRow extends Sealed {
  version: number;
}

interface VersionWrite {
  itemId: string;
  version: number;
  sealed: Sealed;
}

export function createDb(path: string): Database {
  const db = new Database(path, { create: true });
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = FULL');
  db.run(`CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY, version INTEGER NOT NULL, iv BLOB NOT NULL, data BLOB NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS item_history (
    item_id TEXT NOT NULL, version INTEGER NOT NULL, iv BLOB NOT NULL, data BLOB NOT NULL,
    PRIMARY KEY (item_id, version))`);
  db.run(`CREATE TABLE IF NOT EXISTS records (
    seq INTEGER PRIMARY KEY, kind TEXT NOT NULL, item_id TEXT NOT NULL, version INTEGER NOT NULL)`);
  return db;
}

export function createKeyStore(path: string, secureDelete: boolean): Database {
  const keys = new Database(path, { create: true }),
    mode = secureDelete ? 'ON' : 'OFF';
  keys.run('PRAGMA journal_mode = WAL');
  keys.run('PRAGMA synchronous = FULL');
  keys.run(`PRAGMA secure_delete = ${mode}`);
  keys.run(
    'CREATE TABLE IF NOT EXISTS item_keys (item_id TEXT PRIMARY KEY, wrapped BLOB NOT NULL)',
  );
  return keys;
}

// The item ID and version are the additional data, so a ciphertext cannot move to another row.
function buildAad(itemId: string, version: number): string {
  return `${itemId}:${version}`;
}

function writeVersion(db: Database, write: VersionWrite): void {
  const kind = write.version === 1 ? 'memory_created' : 'memory_changed',
    iv = write.sealed.iv,
    data = write.sealed.data;
  db.transaction(() => {
    db.query('INSERT OR REPLACE INTO items (id, version, iv, data) VALUES (?, ?, ?, ?)').run(
      write.itemId,
      write.version,
      iv,
      data,
    );
    db.query('INSERT INTO item_history (item_id, version, iv, data) VALUES (?, ?, ?, ?)').run(
      write.itemId,
      write.version,
      iv,
      data,
    );
    db.query('INSERT INTO records (kind, item_id, version) VALUES (?, ?, ?)').run(
      kind,
      write.itemId,
      write.version,
    );
  })();
}

export async function createItem(
  stores: Stores,
  itemId: string,
  versions: string[],
): Promise<void> {
  const key = await createItemKey(),
    wrapped = await encodeItemKey(key, stores.deploymentKey);
  stores.keys.query('INSERT INTO item_keys (item_id, wrapped) VALUES (?, ?)').run(itemId, wrapped);
  for (const [index, text] of versions.entries()) {
    const version = index + 1,
      sealed = await encodeText(key, text, buildAad(itemId, version));
    writeVersion(stores.db, { itemId, sealed, version });
  }
}

export function getWrappedKey(keys: Database, itemId: string): Uint8Array | undefined {
  const row = keys.query('SELECT wrapped FROM item_keys WHERE item_id = ?').get(itemId) as {
    wrapped: Uint8Array;
  } | null;
  return row?.wrapped;
}

function getItemKey(stores: Stores, itemId: string): Promise<CryptoKey> | undefined {
  const wrapped = getWrappedKey(stores.keys, itemId);
  if (!wrapped) {
    return undefined;
  }
  return decodeItemKey(wrapped, stores.deploymentKey);
}

// Undo writes the earlier text as a new version under the same key.
export async function writeNextVersion(
  stores: Stores,
  itemId: string,
  text: string,
): Promise<number> {
  const key = await getItemKey(stores, itemId);
  if (!key) {
    throw new Error(`no key for ${itemId}`);
  }
  const row = stores.db.query('SELECT version FROM items WHERE id = ?').get(itemId) as {
      version: number;
    },
    version = row.version + 1,
    sealed = await encodeText(key, text, buildAad(itemId, version));
  writeVersion(stores.db, { itemId, sealed, version });
  return version;
}

export async function readCurrent(stores: Stores, itemId: string): Promise<string | undefined> {
  const key = await getItemKey(stores, itemId),
    row = stores.db
      .query('SELECT version, iv, data FROM items WHERE id = ?')
      .get(itemId) as VersionRow | null;
  if (!key || !row) {
    return undefined;
  }
  return decodeText(key, row, buildAad(itemId, row.version));
}

export async function readHistory(stores: Stores, itemId: string): Promise<(string | undefined)[]> {
  const key = await getItemKey(stores, itemId),
    rows = stores.db
      .query('SELECT version, iv, data FROM item_history WHERE item_id = ? ORDER BY version')
      .all(itemId) as VersionRow[],
    texts: (string | undefined)[] = [];
  for (const row of rows) {
    if (key) {
      const text = await decodeText(key, row, buildAad(itemId, row.version));
      texts.push(text);
    } else {
      texts.push(undefined);
    }
  }
  return texts;
}

// Forgetting deletes the key and nothing else: the ciphertext and the envelopes stay.
export function removeItemKey(keys: Database, itemId: string): void {
  keys.query('DELETE FROM item_keys WHERE item_id = ?').run(itemId);
}
