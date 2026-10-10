/* oxlint-disable one-var -- separate fixture data and wrapped-key stores */
import { Database } from 'bun:sqlite';

export interface Stores {
  data: Database;
  keys: Database;
  wrappingKey: CryptoKey;
}
interface Item {
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}

export function createData(path: string): Database {
  const db = new Database(path);
  db.exec(
    'PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS item(id TEXT PRIMARY KEY, nonce BLOB, ciphertext BLOB)',
  );
  return db;
}

export function createKeys(path: string): Database {
  const db = new Database(path);
  db.exec(
    'PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS key(id TEXT PRIMARY KEY, value BLOB); CREATE TABLE IF NOT EXISTS generation(value INTEGER NOT NULL)',
  );
  const count = db.query<{ count: number }, []>('SELECT count(*) AS count FROM generation').get();
  if (count?.count === 0) {
    db.exec('INSERT INTO generation VALUES(0)');
  }
  return db;
}

export function createWrappingKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new Uint8Array(32).fill(7), 'AES-KW', false, [
    'wrapKey',
    'unwrapKey',
  ]);
}

export async function createItem(stores: Stores, id: string, text: string): Promise<void> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const wrapped = await crypto.subtle.wrapKey('raw', key, stores.wrappingKey, 'AES-KW');
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: new TextEncoder().encode(id) },
    key,
    new TextEncoder().encode(text),
  );
  stores.keys
    .transaction(() => {
      stores.keys.query('INSERT INTO key VALUES(?,?)').run(id, new Uint8Array(wrapped));
      stores.keys.exec('UPDATE generation SET value=value+1');
    })
    .immediate();
  stores.data.query('INSERT INTO item VALUES(?,?,?)').run(id, nonce, new Uint8Array(ciphertext));
}

export async function readItem(stores: Stores, id: string): Promise<string | undefined> {
  const wrapped = stores.keys
    .query<{ value: Uint8Array }, [string]>('SELECT value FROM key WHERE id=?')
    .get(id);
  const item = stores.data
    .query<Item, [string]>('SELECT nonce,ciphertext FROM item WHERE id=?')
    .get(id);
  if (!wrapped || !item) {
    return undefined;
  }
  const key = await crypto.subtle.unwrapKey(
    'raw',
    wrapped.value,
    stores.wrappingKey,
    'AES-KW',
    'AES-GCM',
    false,
    ['decrypt'],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: item.nonce, additionalData: new TextEncoder().encode(id) },
    key,
    item.ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

export function getGeneration(keys: Database): number {
  const row = keys.query<{ value: number }, []>('SELECT value FROM generation').get();
  if (!row) {
    throw new Error('Missing generation fixture row');
  }
  return row.value;
}

export function removeKey(keys: Database, id: string): void {
  keys
    .transaction(() => {
      keys.query('DELETE FROM key WHERE id=?').run(id);
      keys.exec('UPDATE generation SET value=value+1');
    })
    .immediate();
  keys.exec('PRAGMA wal_checkpoint(TRUNCATE)');
}
