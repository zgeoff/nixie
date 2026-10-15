# The database and the single writer

nixie keeps its state in one SQLite file, `nixie.db`, in the data directory, under
[0025](../../decisions/0025-database-and-topology.md). One process writes it at a time, and that
process proves it is still the writer inside every write transaction, so even a second process that
slipped past the lock commits nothing. `libs/db` is the one package that opens a SQLite file: it
holds the connection, the migration runner and the schema version. `modules/log` turns a process
into the writer and hands every other module its database handle, so no module opens a connection of
its own. [The event log](./event-log.md) covers what the database holds, and
[erasable fields](./erasable-fields.md) covers the key store beside it.

## The connection

The connection runs in a worker thread. A long query or a synchronous fsync on the main thread would
block the event loop for its whole length, and every runner, every tool call and every API request
shares that loop.

The worker holds one connection, and Kysely queues every query and transaction behind the one in
flight. Every transaction takes SQLite's write lock as it opens. A transaction that opens as a read
and writes later fails as locked once another connection has committed in between, and the lock
taken up front rules that out. The connection waits on a busy lock before it switches the file to
WAL mode, because the switch itself takes a lock, and a second connection opening at the same moment
would otherwise fail at once. WAL lets a reader run beside the writer, and every commit syncs to
disk in full, so a claimed outside action survives a power loss.

SQLite rolls a transaction back on its own after some errors, such as a trigger that raises a
rollback. The worker then fails every later statement of that transaction, because SQLite would
otherwise run each of them as a transaction of its own, outside the writer epoch check that opened
the real one.

## The single writer

A process becomes the writer in three steps, before any migration runs, and a failure at any step
releases what the earlier steps took.

1. The process refuses to start when the data directory sits on a network filesystem. The writer
   lock and SQLite's own locks hold only between processes on one kernel, and a network filesystem
   can let a second machine write the same file.
2. It takes an exclusive lock on the data directory and holds it for its whole life, so the kernel
   frees the lock only when the process ends. A second process that finds the lock held exits
   non-zero.
3. It raises the writer epoch stored in the database by one and keeps the new value.

The lock sits on the data directory, the volume's mount root, and never on `nixie.db` itself. A lock
on the database would need a descriptor of its own on that file, and closing any descriptor on a
file drops every POSIX lock the process holds on it, SQLite's included. A mount root also cannot be
swapped for a fresh copy that a second process could lock.

The lock stops a second writer that starts while the first runs. The writer epoch stops a second
writer that a bug let through, such as one whose lock descriptor was closed by mistake. Every write
transaction reads the stored epoch as its first statement, and a process whose epoch is no longer
the stored one stops writing and exits. Because every transaction takes the write lock as it opens,
a write that began before another process raised the epoch commits first, and no write under the
older epoch commits after the raise. The epoch's table exists before every migration, because the
epoch rises before the first migration runs.

## Migrations

The build's migrations form one ordered list, and the schema version is the number of them applied.
A migration appends to the list and never changes one already released, so every database at a given
version has the same shape.

Each migration commits in its own transaction together with the new schema version, so a failed
migration leaves the schema at the version before it. SQLite ignores the foreign key setting inside
a transaction, so the runner turns enforcement off around the migrations and each migration checks
every foreign key itself before it commits. A table rebuild would otherwise cascade its drop into
the child rows.

A module's table types and the migrations cannot disagree without a check failing. A generated file
in the database library types every column the migrations build, as the SQLite driver reads it, and
a test fails when that file differs from what the migrations build. Each module wraps its table map
in a check against the file, so typecheck fails when the map leaves out a column, adds a column no
migration creates, or gives a column another type or nullability. A module that reads part of
another module's table names that table as a view, and the check lets a view leave columns out.
After a migration, `bun run --cwd libs/db tables` rewrites the file.

Before the first migration of a release, nixie writes a copy of the database into the data
directory, named for the schema version it holds. SQLite neither syncs such a copy nor makes it
atomic, so the copy reaches the disk under a temporary name before it takes its own, and an
interrupted copy never sits under the final name. The copy holds only `nixie.db`, so a key deleted
after it was taken never comes back from it.

Every migration expands the schema: a new table, a column with a default, or an index. A removal or
a rename waits until the release before no longer needs the old shape. The schema version therefore
carries its oldest reader, the oldest schema version whose build can still read and write the
database. A build that meets a newer schema runs on it unchanged when its own version reaches that
oldest reader, so reverting one release needs no restore and loses no writes. A release that breaks
the release before raises the oldest reader. A build older than that refuses to start, and its error
points at the newest pre-migration copy it can read, or at a backup when no copy exists.

## Key store IDs

Every ID that keys the key store is random, and never a row number or any other sequence. A restore
brings back an older `nixie.db`, while the live key store keeps the keys of records written after
that backup. A reused row number in the restored database would then meet a stale key under the same
ID.

## Short IDs

A memory item exposes a short ID, a 10-character cuid2 such as `k3x9m2p7qa`, and the conversation's
model reads and names the item by it instead of by its UUID. A UUID costs 36 characters in every
prompt, tool result and tool call that names the record, and the model gains nothing from the extra
length. Every kind of record that the model can see follows the same rule when it is added. Two
views from before the rule show UUIDs: memory proposals, and the memory writer's view of the items
it reads.

The UUID stays the record's own key, in the log, in every foreign key and in the key store, so a
short ID is an alias that only the model's side of each tool reads and writes. A tool that takes an
ID accepts the short ID, and the UUID too, because a session can hold IDs that the model read before
its record had a short ID.

The record that creates a row carries the row's short ID, so a rebuild from the log gives the same
ID. A row from before short IDs takes one derived from its UUID, and the migration that adds the
short ID backfills the same derived value, so the fold and the backfill agree. A memory
consolidation change always takes the ID its UUID gives, because its proposal record keeps the shape
that the release before reads. That release rejects an unknown key in the record, so a rollback
could not rebuild its tables from a record that carried the short ID.
