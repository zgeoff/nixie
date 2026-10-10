# The database and the single writer

nixie keeps its state in one SQLite file, `nixie.db`, in the data directory, under
[0025](../decisions/0025-database-and-topology.md). `libs/db` is the one package that opens it: it
holds the Kysely dialect, the migration runner and the schema version. `modules/log` makes one
process the writer, with the writer lock and the writer epoch. `startWriter` runs every step below
in order, and any failure releases what the start took.

## The dialect

`startDatabase` returns a Kysely handle whose dialect runs `bun:sqlite` in a Worker. **Why:** a long
query or a synchronous fsync on the main thread blocks the event loop for its whole length.

- The worker holds one connection, and Kysely queues every query and transaction behind the one in
  flight.
- Every transaction opens with `BEGIN IMMEDIATE`, which takes the write lock at once. **Why:** a
  plain `BEGIN` takes a read snapshot, and a later write in the same transaction fails with
  `database is locked` once another connection has committed.
- The connection sets `busy_timeout` first, then WAL mode, `synchronous = FULL` and foreign keys.
  **Why:** the switch to WAL takes a lock too, and without the timeout a second connection that
  opens at the same moment fails at once.
- A SQLite error reaches the caller as a `DatabaseError` with SQLite's result code, such as
  `SQLITE_CONSTRAINT_UNIQUE`.
- When SQLite rolls a transaction back on its own, such as on a trigger's `RAISE(ROLLBACK)`, the
  worker fails every later statement of that transaction. **Why:** each one would otherwise commit
  on its own, outside the transaction and its writer epoch check.

The lint rules refuse `bun:sqlite` outside `libs/db`. A module narrows the handle to its own tables
with Kysely's `withTables`.

## The single writer

One nixie process writes the database at a time. `startWriter` takes 3 steps before any migration
runs:

1. **The filesystem check.** nixie refuses to start when `statfs` reports the data directory on a
   network filesystem, such as NFS, SMB or 9P. **Why:** the lock and SQLite's own locks hold only
   between processes on one kernel.
2. **The writer lock.** nixie takes an exclusive `flock` on the data directory through libc, because
   Bun has no `flock`. When another process holds it, the start throws
   `writer lock held by another process`, and the process exits non-zero. The descriptor stays open
   for the life of the process, so the kernel releases the lock only when the process dies.
3. **The writer epoch.** nixie raises the epoch in the one-row `writer_epoch` table in one
   transaction and keeps the new value.

The lock sits on the data directory, the volume's mount root, and never on `nixie.db`. **Why:**
closing any descriptor on a file drops every POSIX lock the process holds on it, SQLite's included,
and a mounted directory cannot be replaced by a fresh copy that a second process could lock.

`withWriteTransaction` reads the stored epoch as the first statement of every write transaction and
throws `StaleWriterError` when it differs from the process's own. The process then exits. **Why:**
only a nixie bug that closed the lock's descriptor lets a second process write, and the epoch stops
that process at its next write. `BEGIN IMMEDIATE` orders the epoch raise against write transactions:
a write that began before the raise commits first, and no write under the older epoch commits after
it.

The `writer_epoch` table predates every migration, because the epoch rises before the first
migration runs.

## Migrations

`runMigrations` brings the database to the schema the build writes. `nixieSchema` in `libs/db` lists
the build's migrations in order, and the build writes schema version N after N migrations.

- Each migration runs in its own transaction, together with the update of the one-row
  `schema_version` table, and the writer epoch check opens that transaction. A failed migration
  leaves the schema at the version before it.
- The runner turns foreign key enforcement off around the migrations, and each migration runs
  `foreign_key_check` before it commits. **Why:** SQLite ignores the pragma inside a transaction,
  and a table rebuild's `DROP TABLE` would otherwise cascade into the child rows.
- Before the first migration of a release, nixie copies the database with `VACUUM INTO` to
  `nixie-schema-<version>.db` in the data directory. The copy goes to a temporary file, reaches the
  disk, and then takes its name. A database that holds no schema yet gets no copy. The copy holds
  only the database, so the key store never enters it.
- Every migration expands the schema: new tables, columns with defaults, or indexes. A removal or a
  rename waits until the release before no longer needs that shape.

`schema_version` holds the version and its oldest reader: the oldest schema version whose build can
still read and write it. The build that migrates writes both. A version short of the build's own,
left by a failed upgrade, records an oldest reader no newer than itself. A build that meets a newer
schema runs on it unchanged when its own version reaches the oldest reader. Otherwise it refuses to
start, and the error names the newest `nixie-schema-<version>.db` copy it can read, or a backup when
no copy exists. **Why:** a release that keeps the schema readable leaves the oldest reader where it
was, so reverting one release needs no restore and loses no writes. A release that breaks the
release before raises `oldestReader` in `nixieSchema`, and its pull request says so.

## Key store IDs

Every ID that keys the key store is random, such as `crypto.randomUUID()`, and never a row number.
**Why:** after a rollback, the live key store holds keys for rows the restored database lacks, and a
reused row number would collide with them.
