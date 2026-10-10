# Spike: crypto-shredding memory items in SQLite

This spike checks that a key per memory item makes "forget" reach the live database and its backups,
in the layout the [event log design](../../core/event-log.md#erasable-fields-and-keys) sets out. The
memory database holds only ciphertext, and every item key lives in a separate key store file,
wrapped by a deployment key. Every version of an item in the history table shares the item's key.
Database backups use `VACUUM INTO`, and the key store backup is one copy that each backup run
replaces.

- Bun 1.4.2 with `bun:sqlite`, which bundles SQLite 3.53.2
- WebCrypto: AES-256-GCM for item text, with the item ID and version as additional data, and AES-KW
  for wrapping each item key under the deployment key
- Both databases in WAL mode with `synchronous = FULL`, as
  [0025](../../../../decisions/0025-database-and-topology.md) sets

## Question

Does deleting one item key make that item unreadable in the live database and in a backup, while
every other item and every log envelope stays readable? What still leaks: the key store file's freed
pages, its WAL, or a persisted full-text index? What do encryption and decryption cost at personal
scale?

## Run it

Run the command from this directory. It writes only under a fresh temporary directory and removes it
at the end.

```bash
bun install
bun shred.ts
```

- [crypto.ts](crypto.ts) holds the key generation, wrapping and AES-GCM calls.
- [store.ts](store.ts) holds the 2 databases: `items`, `item_history` and an envelope-only `records`
  table in one, `item_keys` in the other.
- [shred.ts](shred.ts) runs the checks and prints the output below.

## Answer

Crypto-shredding works as the design lays it out, with 2 conditions on the key store: it runs with
`PRAGMA secure_delete = ON`, and a forget waits for a WAL checkpoint before nixie reports it done. A
persisted FTS5 index over plain text keeps a forgotten word in the file under default settings, and
every backup taken before the forget keeps it whatever the settings, which supports building the
search index in memory.

```text
bun 1.4.2, SQLite 3.53.2
1. 300 items x 3 versions: write 81.4 ms, decrypt all 8 ms
   records: 900
2. forget item-42
   live db, current keys: unreadable
   db backup, current keys: unreadable
   db backup, key backup taken before forget: The owner's dentist is Dr zqmarker00042 on Harbour Street, version 3.
   db backup, key backup replaced after forget: unreadable
   envelopes left for item-42: [{"kind":"memory_created","version":1},{"kind":"memory_changed","version":2},{"kind":"memory_changed","version":3}]
   item-43 still reads: The owner's dentist is Dr zqmarker00043
   plaintext marker: memory.db no plaintext, memory-backup.db no plaintext, keys.db no plaintext, keys-backup.db no plaintext
5. undo and history
   item-7 undo wrote version 4; history reads 4 versions
   item-42 history: 3 rows, 3 unreadable
3. key store, secure_delete OFF: wrapped key bytes found
   before forget: file=true wal=false
   after delete: file=true wal=true
   after checkpoint: file=true wal=false
   after VACUUM: file=false wal=false
3. key store, secure_delete ON: wrapped key bytes found
   before forget: file=true wal=false
   after delete: file=true wal=false
   after checkpoint: file=false wal=false
   after VACUUM: file=false wal=false
3. persisted FTS5 over plaintext, row for item-42 deleted: forgotten word
   default: query finds 0; bytes in file=true; after VACUUM file=true
   secure_delete pragma: query finds 0; bytes in file=true; after VACUUM file=true
   fts5 secure-delete: query finds 0; bytes in file=true; after VACUUM file=false
   fts5 secure-delete and pragma: query finds 0; bytes in file=false; after VACUUM file=false
   optimize: query finds 0; bytes in file=true; after VACUUM file=false
   rebuild: query finds 0; bytes in file=true; after VACUUM file=false
4. 10000 items x 3 versions: write 2604 ms, decrypt all 366.8 ms
   decrypt all at once with Promise.all: 176.6 ms
   key unwrap: 1.6 µs per item
```

- **Forget reaches the backups.** After the key is deleted, item 42 reads as unreadable from the
  live database and from a database backup taken before the forget. Its 3 history versions are all
  unreadable, and its 3 envelopes in `records` stay readable, which is the gap a replay shows.
  Neighbouring items read as before.
- **The key store backup is the window.** A key store backup taken before the forget still opens the
  item from the old database backup. Once the next backup run replaces the key store copy, the item
  is gone from every backup. The window is therefore the key store backup interval, daily by default
  in the event log design.
- **The databases never hold plain text.** A unique marker in every item's text appears in neither
  database file, nor in either backup.
- **The key store needs `secure_delete`.** With it off, the deleted wrapped key stays in the key
  store file's freed space after a checkpoint, and its page image also sits in the WAL until the
  checkpoint. With it on, SQLite zeroes the cell, and the bytes leave the file at the next
  checkpoint. `VACUUM` clears them in both modes. A wrapped key is useless without the deployment
  key, so this leak matters only to someone who holds both the key store file and the deployment
  key.
- **A persisted FTS5 index keeps forgotten words.** With FTS5's defaults, the deleted row's word
  stays in the index file even after `VACUUM`, because FTS5 records a delete as a marker until its
  segments merge. FTS5's own `secure-delete` option together with `PRAGMA secure_delete` removes it
  at once, and the `secure-delete` option, `optimize` or `rebuild` followed by `VACUUM` removes it
  too. No setting reaches a backup taken before the forget, which holds the word in plain text for
  as long as that backup lives.
- **Undo keeps the item key.** Undo writes the earlier text as a new version under the same key, and
  a forget makes every version unreadable at once.
- **Cost is small at personal scale.** 300 items with 3 versions each wrote in 70 to 135 ms and
  decrypted in 8 to 35 ms across 3 runs. 10,000 items decrypted in 367 ms one at a time, or 177 ms
  with the decryptions in parallel, which bounds the start-up cost of an in-memory index over
  memory. Unwrapping a key costs about 2 µs. Writes are dominated by one `synchronous = FULL`
  transaction per version.

## Untested

- A restore on a clean host from restic or age-encrypted backups, which the backup and restore spike
  in [Linear](https://linear.app/zgeoff/issue/GEO-264) covers.
- Litestream replication of the key store: its replica and its retained WAL segments would keep a
  deleted key for their own retention period.
- Remnants below SQLite: SSD wear levelling, journaling and copy-on-write filesystems, and imp disk
  snapshots can keep freed bytes that `secure_delete` overwrote in the file.
- The deployment key's own storage, and rotating it, which rewraps every item key.
- Crypto-shredding of event log payloads with a key per record, which follows the same pattern at a
  larger count of keys.
