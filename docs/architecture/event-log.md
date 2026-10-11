# The event log

`modules/log` writes every record nixie keeps to one append-only table, and nothing changes a record
once it is written. Each record carries a plaintext envelope and a plain payload of structured data.
Its free-text fields are encrypted under a key of its own, which lives in a key store apart from the
database. Projections change in the same transaction as the record that changes them, and a reader
follows the log by sequence together with the projection rows each record changed.

## What a record holds

The envelope holds what a replay or an audit reads without the free text: the sequence, the time,
the kind, the thread, the step key, the parent record, the source of content, the decision, the
prompt cause, the definitions in force and the approval. The payload holds the kind's structured
data. The erasable fields hold the kind's free text.

- **Sequence.** The sequence orders the log. SQLite allows one writer, so the sequence grows in
  commit order, and a reader that asks for the records after a sequence misses none.
- **Step key.** The step key is unique across the log, so a task step commits once
  ([tasks](tasks.md#steps)).
- **Definitions.** The log refuses a batch with a record that carries no snapshot hash, before it
  writes any key or row. **Why:** a replay of a decision needs the definitions that were in force.
- **Corrections.** Triggers refuse every update and delete. A correction is a new record whose
  parent is the record it corrects.

A batch of records commits in one write transaction behind the writer epoch check. A module can
append inside a write transaction it already holds, so its own rows and the records that describe
them commit together, as the [definitions seed](definitions.md#seeding) does.

## Erasable fields and the key store

Every free-text field, such as message text, tool arguments and tool results, goes in the erasable
fields, never in the payload. Each record with erasable fields gets a random key, wrapped with the
deployment key, under a random key ID ([key store IDs](database.md#key-store-ids)). The record's
fields are encrypted with the key ID bound in, so a ciphertext copied to another record fails to
decrypt.

The key store is its own SQLite file beside the database. **Why:** a database backup then holds only
ciphertext, and a key deleted from the key store never returns with a restore of the database. The
key store overwrites deleted content and has no migrations, because a copy taken before a migration
would keep every key deleted after it.

The key commits before its record. A failed record write therefore leaves an unused key, and never a
record whose key is missing.

Removing a key checkpoints the key store, so neither the file nor its write-ahead log holds the
wrapped key afterwards. A reader that holds the key store open blocks the checkpoint, and the
removal fails until a retry finishes it. The record keeps its envelope and payload, and its erasable
fields read as shredded. The database holds no full-text index over erasable fields, because an
index would keep the plaintext after its key is gone.

## Projections

A projection is a table that folds one record at a time and reports the keys of the rows it changed.
A fold reads the envelope and the payload, never the erasable fields. **Why:** a fold after a forget
then gives the same rows as the fold before it.

Every projection folds each record inside that record's transaction, and a failed fold rolls back
the whole batch. The log keeps each changed row, as it stands after that record, beside the record's
sequence, with a null row for a removed one. The log owns one projection of its own, one row per
thread. A module adds its projections where the server builds the log.

A rebuild empties every projection and the changed rows, then folds the log from the first record in
one write transaction. A rebuild gives the same tables as the live fold, which makes the log the
source of truth for every projection.

## Reading by sequence

A read returns the records after a sequence, oldest first, each with its decrypted erasable fields
and the projection rows of its own sequence. A reader that applies a record and its rows together,
then moves its cursor, sees the rows as of each record, never current rows under an older sequence.
A record whose key fails to unwrap, or whose ciphertext fails to decrypt, reads as unreadable with
its envelope intact, so it never stops a reader at its sequence.

A subscription yields the same entries and then waits for one of 3 wakes:

- a change to the database's write-ahead log, which the subscription rechecks a few times on a short
  backoff, because SQLite writes a commit's frames before it publishes the commit
- a poll, for a change the watcher misses or a filesystem that cannot watch
- the abort signal, which ends the subscription and stops the watcher and the poll

The subscription marks every earlier wake as seen before each read, so a commit that lands during a
read wakes the next read at once.
