# The event log

`modules/log` writes every record nixie keeps to the `records` table in `nixie.db`, and nothing
changes a record once it is written. Each record carries a plaintext envelope and a plain payload of
structured data. Its free-text fields are encrypted under a key of its own, which lives in a key
store apart from the database. The projections that answer questions about the log change in the
same transaction as the record that changes them, and a reader follows the log by sequence with the
projection rows each record changed.

## What a record holds

`writeRecords` is the append API. It takes one or more records and writes them in one write
transaction through `withWriteTransaction`, so the writer epoch check opens it.

| Part              | Holds                                                                  |
| ----------------- | ---------------------------------------------------------------------- |
| Sequence          | The integer primary key, which orders the record in the log            |
| Time              | When nixie wrote the record                                            |
| Kind              | Such as `owner_message` or `tool_called`                               |
| Thread            | The conversation or the task the record belongs to, or none            |
| Step key          | The task step that wrote it, unique so a step commits once             |
| Parent            | The sequence of the record that caused it                              |
| Source of content | `owner`, `owner_data` or `untrusted`                                   |
| Decision          | Outcome, stage, rule and revision, destinations, consent and auto-mode |
| Prompt cause      | One of the 6 prompt causes                                             |
| Definitions       | The snapshot hash, and the persona and job versions the task pins      |
| Approval          | Proposal ID, approval ID and action hash                               |
| Payload           | The kind's structured data, in plain JSON                              |
| Erasable fields   | The kind's free text, as AES-256-GCM ciphertext under the record's key |

`writeRecords` refuses the whole batch with `MissingDefinitionsError` when a record carries no
snapshot hash, before it writes any key or row. **Why:** a replay of a decision needs the
definitions that were in force, and the caller takes the hash from the writer's context.

Triggers on `records` refuse every update and delete with `records are append-only`. A correction is
a new record whose parent is the record it corrects.

## Erasable fields and the key store

A caller puts every free-text field, such as message text, tool arguments and tool results, in
`erasable`, never in `payload`. For a record with erasable fields, `writeRecords` creates a random
AES-256-GCM key, wraps it with the deployment key through AES-KW, and writes it to `keys.db` under a
key ID from `crypto.randomUUID()`. It then encrypts the fields with the key ID as additional data,
so a ciphertext copied to another record fails to decrypt.

`keys.db` is its own SQLite file beside `nixie.db`, and `startWriter` opens it after the migrations.
**Why:** a database backup then holds only ciphertext, and a key deleted from the key store never
returns with a restore of `nixie.db`. The key store runs with `secure_delete` on and has no
migrations, because a copy taken before a migration would keep every key deleted after it.

The key commits before its record. A failed record write therefore leaves an unused key, and never a
record whose key is missing.

`removeRecordKey` deletes one key and checkpoints the key store, so neither `keys.db` nor its WAL
holds the wrapped key afterwards. The record keeps its envelope and its plain payload, and a read
returns its erasable fields as `shredded`. The database holds no full-text index over erasable
fields.

## Projections

A projection is a table with a key column and a `fold` that applies one record to it and returns the
key of every row it changed. `fold` receives the envelope and the plain payload, never the erasable
fields. **Why:** a fold after a forget then gives the same rows as the fold before it.

For each record, `writeRecords` runs every projection's fold in the record's transaction. It then
writes each changed row, as the row stands after that record, to `projection_changes`, or a null row
when the record removed it. A failed fold rolls back the whole batch.

`logProjections` lists the projections the log owns: `threads`, one row per thread with its first
and last sequence, its record count and the time of its last record. A module with its own
projections adds them to that list where the server builds the log.

`runProjectionRebuild` empties every projection and `projection_changes`, then folds the log from
the first record, all in one write transaction. The fold test in `run-projection-rebuild.test.ts`
drops every projection, rebuilds it, and compares the result with the live tables.

## Reading by sequence

`readRecords` returns the records after a sequence, oldest first, each with its decrypted erasable
fields and the `projection_changes` rows of its own sequence. A reader that applies the record and
its rows together, then moves its cursor, sees the rows as of each record, never current rows under
an older sequence. SQLite allows one writer, so the sequence grows in commit order and a reader that
asks for the records after N misses none.

`subscribeToRecords` yields the same entries as an async iterator and then waits for a wake:

- **A WAL change.** `subscribeToWAL` watches the data directory for writes to `nixie.db-wal`. SQLite
  writes a commit's frames before it publishes the commit, so each change wakes the reader at once
  and again after 10, 50 and 250 ms.
- **A poll.** A timer wakes the reader every second by default, for a change the watcher misses or a
  filesystem that cannot watch.
- **The abort signal,** which ends the iterator.

The iterator marks every earlier wake as seen before each read. A commit that lands during a read
therefore wakes the next read at once.
