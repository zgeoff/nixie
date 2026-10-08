# Spike: SQLite or Postgres for the event log

This spike runs the event log core from [decision 0001](../../docs/decisions/0001-durable-layer.md)
on SQLite and on Postgres, through Kysely on Bun, with the same code apart from one claim clause.
Both engines kept every lease, approval and job correct under killed and paused worker processes,
and neither is a throughput constraint at personal-assistant load. The engines differ in operations
and in the traps each one sets: Kysely's SQLite dialects need `BEGIN IMMEDIATE` added by hand, and a
read-modify-write on Postgres at its default isolation loses updates. The spike recommends SQLite
for a first version that stays on one host, with the schema kept portable, and Postgres if a second
host is likely.

## Questions

1. Do leased claims, lease expiry and single-use approvals stay correct with several worker
   processes, on each engine, through Kysely on Bun?
2. How fast does a worker wake on new work: Postgres `LISTEN` and `NOTIFY`, or SQLite polling, and
   what does each cost at idle?
3. Is an append plus a state transition in one transaction a constraint on either engine, at tens of
   transactions per second with bursts of hundreds?
4. What do backup, restore, upgrades, running costs and file export look like on each?
5. Which Kysely dialects on Bun are current, and who maintains them?

## Versions

| Component              | Version                                     |
| ---------------------- | ------------------------------------------- |
| Bun                    | 1.4.2                                       |
| SQLite in `bun:sqlite` | 3.53.2, bundled with Bun on Linux           |
| Postgres               | `postgres:18.6` image (PostgreSQL 18.6)     |
| Kysely                 | 0.29.6                                      |
| `kysely-postgres-js`   | 5.0.1, on Bun's native `Bun.SQL` client     |
| `kysely-bun-worker`    | 2.0.1, both its dialects                    |
| Litestream             | `litestream/litestream:0.5.17` image        |
| sqlite3 CLI            | host package, for the online backup API     |
| Host                   | Ryzen 7 9800X3D, 16 threads, WSL2, ext4 VHD |

## Setup

[`db.ts`](./db.ts) holds one schema for both engines and a connection factory that picks a dialect
from `SPIKE_DB`:

- `pg`: `PostgresJSDialect` from `kysely-postgres-js` over `new SQL()` from Bun.
- `sqlite`: `BunSqliteDialect` from `kysely-bun-worker/normal`, which runs `bun:sqlite` on the main
  thread.
- `sqlite-worker`: `BunWorkerDialect` from `kysely-bun-worker`, which runs `bun:sqlite` in a Worker.

SQLite runs in write-ahead log (WAL) mode with `synchronous = NORMAL` and `busy_timeout = 10000`.
Postgres runs the image defaults, with `synchronous_commit = on` and `shared_buffers` at 128 MB.

The schema has 5 tables:

- `events`: the append-only log.
- `tasks`: a state machine per row, with `lease_owner`, `lease_expires_at` and `lease_epoch`.
- `approvals`: single-use, bound to an action hash, with an expiry.
- `jobs`: the outside-action queue from decision 0021, with the states pending, running, done,
  failed and unknown.
- `claims`: an audit row per claim, with no unique constraint, so the checks can find a double
  claim.

[`core.ts`](./core.ts) holds the primitives, each one transaction:

- **Claim a task.** One `UPDATE … WHERE id = (SELECT … LIMIT 1) RETURNING *` takes a ready task
  whose lease is free or expired, and bumps `lease_epoch`. On Postgres the subquery carries
  `FOR UPDATE SKIP LOCKED`. On SQLite the transaction opens with `BEGIN IMMEDIATE`.
- **Commit a step.** The step's event goes into `events` and the task advances, only if
  `lease_owner` and `lease_epoch` still match the claim. A worker that lost its lease gets zero rows
  back, throws, and rolls back.
- **Consume an approval.**
  `UPDATE approvals SET status = 'consumed' WHERE status = 'pending' AND action_hash = ? AND expires_at > now`
  and, only when that returned a row, the job insert and its event, in the same transaction.
- **Claim, finish and sweep jobs.** A worker claims a pending job, calls a stand-in provider that
  appends to a file outside the database, then marks the job done under the same epoch check. A
  sweep turns a running job whose lease expired into `pending` when it has an idempotency key, and
  into `unknown` when it has none.

Kysely's SQLite dialects open every transaction with a plain `BEGIN`, so `writeTx` in `db.ts` runs
`BEGIN IMMEDIATE` itself through `db.connection()`.

The scripts:

- [`correctness.ts`](./correctness.ts), with the process pool in [`procs.ts`](./procs.ts), runs 8
  worker processes ([`worker.ts`](./worker.ts)) over 200 tasks of 5 steps, with a 1 s lease and a 30
  ms step. It kills 5 workers with `SIGKILL` and starts replacements. One worker stops itself with
  `SIGSTOP` right after its 20th claim and gets `SIGCONT` after its lease expired. It then races 8
  approver processes ([`approve.ts`](./approve.ts)) over 340 approvals, and runs job workers over
  200 jobs, half with an idempotency key, killing 8 of them.
- [`rmw.ts`](./rmw.ts) races 8 processes, 200 rounds each, over one read-modify-write transaction.
- [`wake.ts`](./wake.ts) idles a listener process for 30 s while it measures its own CPU, then
  commits 50 tasks one at a time and times commit to claim.
- [`load.ts`](./load.ts) runs append plus transition at 50 per second for 20 s, a serial burst of
  500, and a burst of 1,000 from 4 processes.
- [`ops.ts`](./ops.ts) seeds 1,000,000 events of about 450 bytes, then measures a full-scan read,
  backup and restore under 4 writers, and export. [`litestream.sh`](./litestream.sh) streams a live
  database to a file replica and restores it.

## Run it

Docker and the sqlite3 CLI need to be on the host, and port 55432 free.

```bash
cd spikes/event-log-db && bun install
bash run.sh
```

[`run.sh`](./run.sh) starts the Postgres container, runs every script in order and writes raw output
under `results/`, which git ignores. A trap removes the container and its volume on exit. A full run
takes about 15 minutes. `bun correctness.ts unlocked` runs the negative control, and
`bun correctness.ts deferred` runs the claims under a plain `BEGIN`.

## Results

The spike ran twice end to end. The first run had the host to itself, with a load average of 3 to 5.
Other jobs shared the host during the second run, with a load average of 16 to 35. Correctness
figures come from the last run and match the first. Timings come from the first run, with the second
run's figure in brackets where the two differ by more than a factor of 2.

### Correctness under concurrency

| Check                                                      | SQLite         | Postgres       |
| ---------------------------------------------------------- | -------------- | -------------- |
| Step events, of 1,000 expected                             | 1,000          | 1,000          |
| Duplicate steps                                            | 0              | 0              |
| Double claims                                              | 0              | 0              |
| Claims orphaned by a kill or the pause                     | 6              | 6              |
| Time from an orphaned claim to the next claim              | 1,001–1,008 ms | 1,002–1,007 ms |
| Commits rejected by the epoch check after the pause        | 1              | 1              |
| Valid approvals with exactly one job and one event, of 300 | 300            | 300            |
| Expired or mismatched approvals with a job, of 40          | 0              | 0              |
| Approver errors, of 2,720 attempts                         | 0              | 0              |
| Jobs done, of 200                                          | 198            | 198            |
| Jobs unknown                                               | 2              | 2              |
| Jobs without a key sent to the provider twice              | 0              | 0              |
| Jobs with a key retried after a sweep                      | 3              | 3              |

The lease is 1 s, so recovery after a kill takes the lease plus up to 12 ms. The paused worker woke
after its lease expired and another worker had taken its task, and its commit returned zero rows. Of
the unknown jobs, some had reached the provider before the kill and some had not, which is why
decision 0021 refuses to retry them. A keyed job retried after a sweep reached the provider twice
with the same key, which a provider that honours the key absorbs.

The negative control drops the claim's lock. It produced 35 double claims on SQLite and 206 on
Postgres, and the epoch check rejected every one of their commits, so the step count stayed at
1,000. The check finds double claims, and the epoch check keeps the log correct even when the claim
is wrong.

### Transaction traps

[`rmw.ts`](./rmw.ts) increments one counter from 8 processes, 1,600 times in all, by reading it and
writing it back:

| Engine and mode                                   | Committed | Final value | Lost updates | Errors                     |
| ------------------------------------------------- | --------- | ----------- | ------------ | -------------------------- |
| SQLite, plain `BEGIN` (Kysely's default)          | 558       | 558         | 0            | 1,042 `database is locked` |
| SQLite, `BEGIN IMMEDIATE`                         | 1,600     | 1,600       | 0            | 0                          |
| Postgres, Kysely's transaction (`READ COMMITTED`) | 1,600     | 200         | 1,400        | 0                          |
| Postgres, with `SELECT … FOR UPDATE`              | 1,600     | 1,600       | 0            | 0                          |

The second run gave 444 commits and 1,156 errors for plain `BEGIN`, and the same figures for the
other rows. A plain `BEGIN` takes a read snapshot, and the later write fails at once when another
process committed since, because `busy_timeout` cannot help a stale snapshot. The claim itself is
immune to both traps, because it is one `UPDATE … RETURNING`: the task claims ran under plain
`BEGIN` with 0 errors and 0 double claims.

### Waking a worker

Latency runs from the producer's commit to the listener's claim committing, so it includes one claim
transaction. CPU is the listener process over 30 s idle.

| Strategy                                   | p50    | p95              | Listener CPU at idle |
| ------------------------------------------ | ------ | ---------------- | -------------------- |
| Postgres `LISTEN`, `pg_notify` in the tx   | 4.3 ms | 5.2 ms (12.8 ms) | 0.27 %               |
| SQLite, query every 1,000 ms               | 403 ms | 956 ms           | 0.45 %               |
| SQLite, query every 100 ms                 | 52 ms  | 93 ms            | 1.0 %                |
| SQLite, `PRAGMA data_version` every 100 ms | 64 ms  | 96 ms            | 0.9 %                |
| SQLite, `PRAGMA data_version` every 10 ms  | 5.3 ms | 10.6 ms          | 1.5 % (2.6 %)        |
| SQLite, `fs.watch` on the `-wal` file      | 1.0 ms | 1.8 ms (19 ms)   | 0.28 %               |

The Postgres server used 37 ms of CPU over the same 30 s (56 ms in the second run). After the test
terminated the listener's connection with `pg_terminate_backend`, Bun.SQL reconnected and ran
`onlisten` again, and the drain there claimed all 5 tasks committed while it was down, the slowest
after 223 ms. Notifications sent while the connection is down are lost, so a listener must drain on
every `onlisten`.

### Append plus transition

Each transaction updates one task and appends one event of about 450 bytes. Latency is per
transaction; lag is how late a 5 ms timer fired on the caller's thread.

| Engine                        | Steady 50/s p50 | p99    | Max lag        | Serial burst | 4-process burst | 4-process max |
| ----------------------------- | --------------- | ------ | -------------- | ------------ | --------------- | ------------- |
| Postgres                      | 3.5 ms          | 5.6 ms | 2 ms           | 328/s        | 843/s           | 25 ms         |
| SQLite, `NORMAL`, main thread | 0.26 ms         | 1.4 ms | 11 ms          | 8,828/s      | 4,577/s         | 115 ms        |
| SQLite, `NORMAL`, Worker      | 0.74 ms         | 1.9 ms | 2 ms           | 1,526/s      | 1,127/s         | 434 ms        |
| SQLite, `FULL`, main thread   | 3.9 ms          | 8.6 ms | 13 ms (232 ms) | 280/s (56/s) | 255/s (69/s)    | 2.9 s (6.2 s) |

Postgres commits with an fsync (`synchronous_commit = on`), and so does SQLite with
`synchronous = FULL`: both cost 3.5 to 4 ms on this disk. SQLite with `NORMAL` in WAL mode skips the
fsync on commit, and a power loss can drop the last commits, though a process crash cannot. With
`FULL` on the main thread, `bun:sqlite` runs the fsync synchronously and blocks the event loop for
it. The multi-second tails come from SQLite's busy handler, which backs off while 4 processes fight
for the write lock.

### Operations

| Measure, 1,000,000 events           | SQLite                                       | Postgres                          |
| ----------------------------------- | -------------------------------------------- | --------------------------------- |
| Size on disk                        | 537 MB                                       | 592 MB                            |
| Full scan, `GROUP BY` over all rows | 1.3 s                                        | 0.33 s                            |
| Event-loop block during the scan    | 1.3 s main thread; 2 ms Worker               | 0 ms                              |
| Backup under 4 writers              | `VACUUM INTO` 1.0 s; online backup API 2.0 s | `pg_dump -Fc` 1.9 s (2.8 s)       |
| Backup integrity                    | `integrity_check` ok                         | restore count matched             |
| Restore                             | open the file, 5 ms                          | `pg_restore` 3.7 s (6.1 s)        |
| Export to a SQLite file             | the backup is the file                       | batched copy through Kysely, 21 s |
| Export to JSON Lines                | 2.7 s, 563 MB                                | not run                           |

The dump came to 13.8 MB because the synthetic payload repeats one character; real messages compress
far less. Litestream 0.5.17, run as a container beside the database, streamed a live database
through the load test to a file replica, and `litestream restore` produced a file with the same
2,500 events, the same maximum id and a clean integrity check, in 0.7 s.

Running Postgres costs a container: the `postgres:18.6` image is 163 MB, a restarted server holds 6
MB of anonymous memory and 21 MB of page cache, and the cgroup grew to 1.1 GiB of mostly page cache
after the 1,000,000-row load. A restart took 1.8 s to accept connections. SQLite costs nothing
beyond the nixie process; the Litestream image is 73 MB when used.

### Dialect maintenance

Registry and GitHub data, read for this spike:

| Package                        | Latest, date       | Kysely peer | Maintainers                     | Notes                                                                                               |
| ------------------------------ | ------------------ | ----------- | ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `kysely`                       | 0.29.6, 2026-09-16 | none        | koskimas, igalklebanov          | core; marks `sqlite` unsupported under Bun                                                          |
| `kysely-postgres-js`           | 5.0.1, 2026-09-25  | `>=0.29 <1` | igalklebanov (Kysely core team) | runs on postgres.js or `Bun.SQL`; 142 stars, 6 open issues                                          |
| `postgres` (postgres.js)       | 3.4.9, 2026-04-05  | none        | porsager                        | not needed on Bun; 327 open issues                                                                  |
| `pg` with Kysely's own dialect | 8.23.1, 2026-09-30 | none        | brianc                          | not run on Bun in this spike                                                                        |
| `kysely-bun-worker`            | 2.0.1, 2026-07-21  | `>=0.29`    | subframe7536, 1 person          | 425 of about 430 commits by its author; 0 open issues; about 700 lines with `kysely-generic-sqlite` |
| `kysely-bun-sqlite`            | 0.4.0, 2025-05-12  | `^0.28.2`   | 1 person                        | stale; pinned to Kysely 0.28                                                                        |
| `@lobomfz/kysely-bun-sqlite`   | 0.4.2, 2026-07-14  | `^0.28.2`   | 1 person                        | fork; pinned to Kysely 0.28                                                                         |
| `kysely-bun-sqlite-dialect`    | 1.0.0, 2026-08-28  | `>=0.29.0`  | 1 person                        | 2 versions, created 2026-08-28                                                                      |
| `kysely-bun-sql`               | 0.2.0, 2025-12-01  | `^0.28.8`   | 1 person                        | Postgres only; pinned to Kysely 0.28                                                                |

`kysely-postgres-js` on `Bun.SQL` worked with no adapter code. It returns `int8` columns as strings,
so the spike reads numbers back through `toNumber`. `kysely-bun-worker` worked in both of its modes,
and its main-thread path is small enough to vendor if its author stops.

## Answers

### 1. Correctness

Both engines are correct with the same design: a claim as one `UPDATE … RETURNING`, an epoch bumped
on every claim, and every commit conditioned on the epoch. The design needs one engine-specific
clause, `FOR UPDATE SKIP LOCKED` on Postgres. Each engine sets one trap for any transaction that
reads and then writes. On SQLite, Kysely opens transactions with a plain `BEGIN`, so nixie's
transaction helper must issue `BEGIN IMMEDIATE`. On Postgres, the default `READ COMMITTED` loses
updates unless the read takes `FOR UPDATE`. A test that races processes, like [`rmw.ts`](./rmw.ts),
catches both, and nixie's crash tests from decision 0001 need one.

### 2. Waking a worker

`LISTEN` wakes a Postgres worker in 4 ms at negligible idle cost, and Bun.SQL reconnects and
re-subscribes on its own. On one host, `fs.watch` on SQLite's `-wal` file did as well, at 1 ms.
Polling `PRAGMA data_version` every 10 ms gave 5 ms at 1.5 % of a core. Both engines need a timer
for scheduled work regardless, since a notification announces new rows, not a `run_at` that comes
due.

### 3. Load

Neither engine is a constraint. At 50 transactions per second, Postgres committed in 3.5 ms at p50
and SQLite in 0.26 ms, or 3.9 ms with the same fsync guarantee. Serial bursts ran at 280 to 8,800
per second, against a need of hundreds. The risks are tails, not throughput: SQLite's busy handler
gave multi-second waits with 4 writing processes, and a synchronous fsync or a long query on the
main thread blocks the event loop.

### 4. Operations

SQLite is simpler to run: the backup is a 1 s `VACUUM INTO` while writers continue, the restore is
opening a file, the export is the file, and there is no service to upgrade. SQLite ships inside Bun,
so it upgrades with Bun, and SQLite keeps its file format backwards compatible
([file format changes](https://sqlite.org/formatchng.html)). Postgres needs a container, `pg_dump`
and `pg_restore`, and a major upgrade about once a year, with each major version supported for 5
years ([versioning policy](https://www.postgresql.org/support/versioning/)). A major upgrade means
`pg_upgrade` with both versions' binaries, or a dump and restore. Litestream gives SQLite continuous
replication off the host and restored exactly here.

### 5. Dialects

Postgres has the stronger driver story: `kysely-postgres-js` comes from the Kysely core team, tracks
Kysely 0.29, and runs on `Bun.SQL`. For `bun:sqlite`, `kysely-bun-worker` is the only Kysely 0.29
dialect with a release history, and one person maintains it. Every other `bun:sqlite` dialect is
pinned to Kysely 0.28 or two months old.

## Recommendation

For the owner to decide: **SQLite for the first version, if nixie stays on one host**, through
`kysely-bun-worker` or a vendored copy of its main-thread path, with these rules:

- One SQLite file holds the policy decision, the approval record and the task state. SQLite keeps a
  transaction across attached files atomic only per file in WAL mode
  ([ATTACH](https://sqlite.org/lang_attach.html)), so a file per module would break the single
  transaction that decision 0006 needs. Module boundaries stay in the workspace packages and their
  lint rules, which suits the modular monolith; neither engine forces database roles per module.
- `synchronous = FULL`, so that a claimed outside-action job survives a power loss and is never sent
  twice. At 4 ms per commit it fits the load.
- All writes go through one nixie process, which avoids the busy-handler tails measured with 4
  writing processes.
- Long reads run on the Worker dialect or off the request path, so they never block the event loop.
- The schema stays portable: this spike ran one Kysely codebase on both engines, and its Postgres to
  SQLite copy moved 1,000,000 events in 21 s, so moving to Postgres later is an export and a copy.

The main trade-off is the driver: SQLite on Bun depends on one maintainer's dialect, or on about 200
lines nixie owns, where Postgres has a dialect from the Kysely core team. SQLite also gives up
`LISTEN` and a second host. If a second host is likely, Postgres removes the move later at the cost
of a container, a yearly major upgrade, and a backup that needs Postgres to read.

## Untested

- A Postgres major upgrade with `pg_upgrade` or a dump into a newer major version.
- Power loss. The durability of `synchronous = NORMAL` against `FULL` comes from SQLite's
  documentation, not from a pulled plug.
- Disk encryption, and backups through restic or Kopia.
- Kysely's own `PostgresDialect` with `pg` on Bun.
- `fs.watch` on the `-wal` file on macOS, and after a checkpoint resets the file.
- Load with real message payloads, which compress and index differently from the synthetic ones.
- A host to itself for every phase: the second run shared the host, and its fsync-bound timings were
  up to 4 times slower.
