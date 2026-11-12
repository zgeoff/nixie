# 0011: One SQLite database on one host

- Date: 2026-10-09
- Status: decided

## Decision

nixie stores the event log, task state, approvals, the action queue and memory in one SQLite
database on one host. Postgres is the path if nixie ever needs a second host.

## Why

- In the
  [event log spike](https://github.com/zgeoff/nixie/tree/e232631a587680970a5c8804455415e7f97140bc/docs/design/platform/spikes/event-log-db/),
  both engines had 0 double claims under killed and stalled workers, and neither limits nixie's
  load: SQLite took 3.9 ms at the median with full fsync, Postgres 3.5 ms.
- One file keeps the policy decision, the approval record and the task state in one transaction, as
  [0001](0001-durable-layer.md) requires, with no database server to run.

## Rejected alternatives

| Option                  | Why not                                                                                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres from the start | Its Kysely driver is maintained by the Kysely core team, and `LISTEN` woke a worker in 4.3 ms. It needs a database server and a backup process, and it needs `FOR UPDATE` on every read before a write: without it, 1,400 of 1,600 updates were lost. |

## Consequences

- A worker wakes on new work by watching the database's WAL file, which took 1.0 ms in the spike, or
  by polling.
- Moving to a second host means moving to Postgres, and the queries must use `FOR UPDATE` there.
