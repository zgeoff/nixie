# 0001: The durable layer

- Date: 2026-10-07
- Status: decided
- Design: [event log](../design/core/event-log.md), [tasks](../design/core/tasks.md)
- Research:
  [engine notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.2-notes/engines.md)

nixie builds its own durable layer on its own event log, and adopts no durable execution engine.
Each long task is an explicit state machine, stored as rows in nixie's database, and a process that
holds a lease runs one step at a time. Task state, proposals, the action queue and the dashboard
data are tables that nixie writes in the same transaction as the record that changes them. A rebuild
check folds the log from the first record and compares the result with those tables, so drift
between them shows. The designs of Absurd, OpenWorkflow and DBOS serve as reference, and nixie
borrows their semantics without depending on them. The database is SQLite under
[0025](./0025-database-and-topology.md).

## Why

- The policy decision point, the approval record and the task state share one database and change in
  one transaction.
- nixie's record stays the only log of record.
- A parked task survives any deploy, because no code replays.
- State tables make a lease claim or a dashboard read one indexed query, and the rebuild check
  catches the one risk they add.
- The layer is built from small primitives that nixie owns, and leaving it costs nothing.

## Alternatives

- **Restate.** It suspends a waiting task without holding a process, and its CI tests Bun. It adds a
  second system and a second log of record, and a handler that waits on an old deployment keeps that
  deployment running ([Restate versioning](https://docs.restate.dev/services/versioning.md)). Its
  server licence is BSL 1.1 until each release is 4 years old.
- **DBOS.** It is an MIT library on Postgres with no extra server. It does not support Bun: its
  `engines` field requires `node >=20`. A waiting task keeps a process polling, and its versions
  need managing by hand after each deploy.
- **State rebuilt from the log on every read.** The state and the log can never disagree, and every
  claim and dashboard read pays for a fold.

## Consequences

- nixie owns leases, durable timers, retries, wake-ups and a run viewer, with crash tests and the
  rebuild check for each. The estimate is 800 to 1,500 lines, and no prototype has tested it.
