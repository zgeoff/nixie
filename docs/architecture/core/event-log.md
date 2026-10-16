# The event log

Everything nixie does becomes a record in one append-only table, and nothing changes a record once
it is written. The tables the rest of nixie reads, such as the tasks table or the actions table, are
projections: each one folds the log a record at a time, inside the transaction that appends the
record. The log is therefore the source of truth, and dropping every projection and folding the log
again from the first record gives the same rows. One operation removes records: the
[reset](#the-reset), which empties the whole log at once. `modules/log` owns the log, under
[0001](../../decisions/0001-durable-layer.md). [Erasable fields](./erasable-fields.md) covers how a
record's free text is encrypted and forgotten, and [the database](./database.md) covers the writer
every append goes through.

## What a record holds

A record has three parts. The envelope holds what a replay or an audit reads without any free text:
the sequence, the time, the kind, the thread, the step key, the parent record, the source of
content, the decision, the prompt cause, the definitions in force and the approval. The payload
holds the kind's structured data, such as IDs, counts, hashes and states. The erasable fields hold
the kind's free text, encrypted under a key of the record's own.

- **Sequence.** SQLite allows one writer, so the sequence grows in commit order, and a reader that
  asks for the records after a sequence misses none.
- **Kind.** The log types a kind as a key of its kind registry, which holds the log's own reset
  record. Each module merges its kinds into the registry from a file its package entry exports, so a
  misspelled kind, or one no module registered, fails type-checking wherever code writes, reads or
  matches it. A kind that several modules name registers in the lowest of them, because a package
  sees only the kinds of the packages it imports. The memory recall record is one case: the memory
  module writes it and the session replay reads it, and memory depends on sessions, so the sessions
  module registers it.
- **Thread.** A record belongs to the conversation, a task, or no thread at all. A task's inbox is
  the records of certain kinds on its thread ([tasks](./tasks.md#the-inbox)).
- **Step key.** The step key is unique across the log, so a task step commits once even when two
  runners race to commit it.
- **Definitions.** Every record carries the snapshot hash of the definitions in force, and the log
  refuses a batch with a record that lacks one before it writes any key or row. A replay of a
  decision needs the definitions it was made under ([the definitions](./definitions.md)).
- **Corrections.** Triggers refuse every update and delete on the table, and only the reset drops
  them, inside its own transaction. A correction is a new record whose parent is the record it
  corrects.

## Appending

```mermaid
flowchart LR
  I["records to append"] --> K["key store<br>a key per record with free text"]
  K --> W["records table<br>next sequence"]
  W --> F["each projection folds the record"]
  F --> C["changed rows<br>beside the record's sequence"]
```

A batch of records commits in one write transaction, behind the writer epoch check. A module can
also append inside a write transaction it already holds, so its own rows and the records that
describe them commit together, as the [definitions seed](./definitions.md#seeding) does. Each
record's free text is encrypted under a fresh key, and the key commits to the key store before the
record commits, so a failed write leaves an unused key and never a record without its key.

## Projections

A projection is a table with a fold: a function that applies one record to the table and returns the
keys of the rows it changed. A fold reads the envelope and the payload, and never the erasable
fields, so a fold after a record's text is forgotten gives the same rows as the fold before it.
Every projection folds each record inside that record's transaction, in a fixed order, because a
later projection may read what an earlier one wrote, and a failed fold rolls back the whole batch.

For each record, the log keeps every row the record changed as it stood after that record, beside
the record's sequence, with a null for a row the record removed. A reader that catches up later
therefore gets the rows as of each record, never the current rows under an older sequence. The log
owns one projection of its own, one row per thread. Each module defines its own projections, and the
server adds them to the log's list when it builds the log.

A rebuild empties every projection and the changed rows, then folds the log from the first record,
all in one write transaction, so no reader sees a half-built table. The fold reads only what the
record holds, never the clock or another table, which is why a rebuild gives the live rows.

## Reading by sequence

A read returns the records after a sequence, oldest first, each with its decrypted erasable fields
and the projection rows it changed. A reader that applies a record and its rows together, then moves
its cursor, stays consistent at every step. A record whose key is gone reads as shredded, and one
whose key or ciphertext fails to decrypt reads as unreadable, both with the envelope intact, so
neither stops a reader at its sequence.

A subscription yields the same entries, then waits for one of three wakes:

- **A change to the database's write-ahead log.** SQLite writes a commit's frames before it
  publishes the commit, so the subscription rechecks a few times on a short backoff after each
  change.
- **A poll.** It catches a change the watcher misses, and covers a filesystem that cannot watch.
- **The abort signal.** It ends the subscription and stops the watcher and the poll at once.

The subscription marks every earlier wake as seen before each read, never after, so a commit that
lands while a read runs wakes the next read at once.

## The reset

A reset removes every record, every projection row and every record key, and keeps the identities of
the device sessions that are still live, under
[0046](../../decisions/0046-resetting-the-event-log.md). The host command sends a control request,
because the server holds the writer lock and no other process can take it, and the server runs the
reset in 7 stages:

1. The server ends its start sequence, answers every new API call with 503, and waits for the calls
   in flight to answer, so no call commits a write that the reset then deletes. It then stops the
   parts the start sequence started: the runner pools stop claiming and give the work in flight the
   normal stop grace.
2. It destroys every sandbox in the sandboxes projection through its adapter, by the path recovery
   uses. A failed destroy stops the reset before it removes anything, and the server exits 1.
3. It deletes every key from the key store and checkpoints it, so neither the file nor its WAL holds
   a key.
4. One write transaction, behind the writer epoch check, defers its foreign key checks to the
   commit, drops the triggers, and deletes every row of every table but the writer epoch, the schema
   version and the identity record. It deletes the revoked and lapsed identities.
5. The same transaction writes the first records of the new log: a definitions seed record that
   repeats the seed in force, a `log_reset` record on the conversation thread, and a `session_kept`
   record for each kept session, which that session's identity row then points at. The transaction
   then creates the triggers again.
6. It deletes the database copies taken before a migration and vacuums both databases, so no old
   page stays in either file.
7. The control request answers, the server stops, and the process exits 0. The container runtime
   starts it again, and the normal start finds the definitions unchanged and creates the
   conversation task and its sandbox again, with no session to resume.

The keys go first, so a crash after stage 3 leaves every record in place with its text shredded, and
a second reset finishes the work. A turn still running at the end of the grace loses its lease row,
so its commit fails the lease check and writes nothing.

The new log continues the old sequence: SQLite gives a new row the highest sequence plus 1, so the
reset keeps the old last record until the first new record has taken the number after it. A device
that resumes its live stream after the last sequence it saw therefore reads the `log_reset` record
next. The `log_reset` record holds the reset time, the old last sequence, the mode and the number of
kept sessions, and no free text, so it gets no key. Because the conversation's thread ID never
changes, the record folds on that thread before the start creates the conversation task again.
