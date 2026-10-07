# 0001: The durable layer

- Date: 2026-10-07
- Status: decided
- Research: [2.2 and 2.3 landscape](../research/2.2-2.3-core-and-policy.md#durable-execution),
  [engine notes](../research/2.2-notes/engines.md)

nixie builds its own durable layer on its own event log, and adopts no durable execution engine.
Each long task is an explicit state machine, stored as rows in nixie's database, and a worker that
holds a lease runs one step at a time. The designs of Absurd, OpenWorkflow and DBOS serve as
reference, and nixie borrows their semantics without depending on them.

## Why

- The policy decision point, the approval record and the task state can share one database and
  change in one transaction.
- nixie's record stays the only log of record.
- A parked task survives any deploy, because no code replays.
- The layer is built from small primitives that nixie owns, and leaving it costs nothing.

## Alternatives

- **Restate.** It suspends a waiting task without holding a process, and its CI tests Bun. It adds a
  second system and a second log of record, and a handler that waits on an old deployment keeps that
  deployment running. Its server licence is BSL 1.1 until each release is 4 years old.
- **DBOS.** It is an MIT library on Postgres with no extra server. Bun is unsupported, a waiting
  task keeps a process polling, and its versions need managing by hand after each deploy.

## Consequences

- nixie owns leases, durable timers, retries, wake-ups and a run viewer, with crash tests for each.
  The engine notes estimate 800 to 1,500 lines; no prototype has tested that figure.
- The choice between Postgres and SQLite for the event log stays open.
