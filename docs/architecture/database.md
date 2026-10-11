# The database and the single writer

nixie keeps its state in one SQLite file in the data directory, under
[0025](../decisions/0025-database-and-topology.md). `libs/db` is the one package that opens it, and
it holds the query layer, the migration runner and the schema version. `modules/log` makes one
process the writer and opens the key store that
[the event log](event-log.md#erasable-fields-and-the-key-store) covers. Every other package takes
its database handle from the writer, so no module opens a connection of its own.

## The connection

The connection runs in a worker thread. **Why:** a long query or a synchronous fsync on the main
thread blocks the event loop for its whole length.

The worker holds one connection, and every query and transaction queues behind the one in flight.
Every transaction takes the write lock when it opens. **Why:** a transaction that starts as a read
and writes later fails as locked once another connection has committed in between.

The connection sets its busy timeout before it switches to WAL mode. **Why:** the switch takes a
lock, and without the timeout a second connection that opens at the same moment fails at once.

When SQLite rolls a transaction back on its own, such as on a trigger's rollback, the worker fails
every later statement of that transaction. **Why:** each statement would otherwise commit on its
own, outside the transaction and its writer epoch check.

## The single writer

One nixie process writes the database at a time. The writer takes 3 steps before any migration runs.
A failure at any step releases what the earlier steps took:

1. **The filesystem check.** nixie refuses to start on a network filesystem. **Why:** the writer
   lock and SQLite's own locks hold only between processes on one kernel.
2. **The writer lock.** nixie takes an exclusive lock on the data directory and holds it for the
   life of the process, so the kernel releases it only when the process dies. A second process that
   finds the lock held exits non-zero.
3. **The writer epoch.** nixie raises the epoch stored in the database and keeps the new value.

The lock sits on the data directory, the volume's mount root, and never on the database file.
**Why:** closing any descriptor on a file drops every POSIX lock the process holds on it, SQLite's
included, and a mounted directory cannot be swapped for a fresh copy that a second process could
lock.

Every write transaction reads the stored epoch as its first statement, and the process exits when
the epoch differs from its own. **Why:** only a nixie bug that closed the lock's descriptor lets a
second process write, and the epoch stops that process at its next write. The write lock orders the
epoch raise against write transactions: a write that began before the raise commits first, and no
write under the older epoch commits after it.

The writer epoch's table exists before any migration, because the epoch rises before the first
migration runs.

## Migrations

The migration runner brings the database to the schema the build writes. The build's migrations form
one ordered list, and the schema version is the count of migrations applied. A migration appends to
that list and never changes a released one.

- Each migration commits in its own transaction with the new schema version, so a failed migration
  leaves the schema at the version before it.
- The runner turns foreign key enforcement off around the migrations, and each migration checks
  every foreign key before it commits. **Why:** SQLite ignores the setting inside a transaction, and
  a table rebuild would otherwise cascade its drop into the child rows.
- Before the first migration of a release, nixie writes a copy of the database to the data
  directory, named for the schema version it holds. The copy reaches the disk under a temporary name
  before it takes its own. The copy holds only the database, so the key store never enters it.
- Every migration expands the schema: new tables, columns with defaults, or indexes. A removal or a
  rename waits until the release before no longer needs that shape.

The schema version is stored with its oldest reader: the oldest schema version whose build can still
read and write the database. A failed upgrade leaves an oldest reader no newer than the version it
reached, so the build before can still open it. A build that meets a newer schema runs on it
unchanged when its own version reaches the oldest reader. Otherwise it refuses to start, and the
error points at the newest pre-migration copy it can read, or at a backup when no copy exists.
**Why:** a release that keeps the schema readable leaves the oldest reader where it was, so
reverting one release needs no restore and loses no writes. A release that breaks the release before
raises the oldest reader.

## Key store IDs

Every ID that keys the key store is random, and never a row number or any other sequence. **Why:**
after a rollback, the live key store holds keys for rows the restored database lacks, and a reused
row number would collide with them.
