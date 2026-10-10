# 0025: The database and the topology

- Date: 2026-10-09
- Status: decided
- Research: [event log spike](../../spikes/event-log-db/)

nixie stores the event log, task state, approvals, the action queue and memory in one SQLite
database on one host. Every transaction that reads and then writes opens with `BEGIN IMMEDIATE`, and
the database runs with `synchronous = FULL`. nixie owns its own Kysely dialect for `bun:sqlite`, run
off the main thread, instead of depending on a published one.

Postgres is the path if nixie ever needs a second host.

nixie is a modular monolith: one deployable, with each module a workspace package, and lint rules
that block imports of another module's internals. The first build leaves out database roles per
module.

## Why

- The event log spike ran the same core on both engines with 8 workers, killed and stalled mid-step:
  both had 0 double claims and 0 duplicate steps, and 300 of 300 approvals ran exactly once.
- Neither engine limits nixie's load. At 50 transactions a second, SQLite took 0.26 ms at the
  median, or 3.9 ms with the same fsync guarantee as Postgres, against 3.5 ms for Postgres.
- One file keeps the policy decision, the approval record and the task state in one transaction, as
  [0001](./0001-durable-layer.md) requires, with no database server to run.
- A plain `BEGIN`, which published Kysely SQLite dialects use, failed 1,042 of 1,600 read-then-write
  transactions with "database is locked", and `BEGIN IMMEDIATE` fixed it.
- On the main thread, a full scan in `bun:sqlite` blocked the event loop for 1.3 s, so the dialect
  runs the database off the main thread.
- The only maintained Kysely dialect for `bun:sqlite` has one maintainer, and nixie's own dialect is
  about 200 lines.
- Lint rules give the module boundaries at little cost. Database roles would enforce the same
  boundaries in the data layer, at a cost too high for a first build.

## Alternatives

- **Postgres from the start.** Its Kysely driver is maintained by the Kysely core team, and `LISTEN`
  woke a worker in 4.3 ms. It needs a database server and a backup process, and it needs
  `FOR UPDATE` on every read before a write: without it, 1,400 of 1,600 updates were lost.
- **`kysely-bun-worker` as the dialect.** It works, and a single maintainer is a risk for the
  database layer.
- **Separate services per module.** It enforces boundaries by process, and adds deployment and
  transactions across services that a personal assistant does not need.

## Consequences

- A worker wakes on new work by watching the database's WAL file, which took 1.0 ms in the spike, or
  by polling.
- Moving to a second host means moving to Postgres, and the queries must use `FOR UPDATE` there.
