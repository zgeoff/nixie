# 0001: The durable layer

- Date: 2026-10-07
- Status: decided, amended by [0025](./0025-database-and-topology.md)
- Research: [2.2 and 2.3 landscape](../research/2.2-2.3-core-and-policy.md#durable-execution),
  [engine notes](../research/2.2-notes/engines.md)

nixie builds its own durable layer on its own event log, and adopts no durable execution engine.
Each long task is an explicit state machine, stored as rows in nixie's database, and a process that
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
  deployment running: "Existing requests continue on the original deployment"
  ([Restate versioning](https://docs.restate.dev/services/versioning.md), 2026-10-07). Its server
  licence is BSL 1.1 until each release is 4 years old, then Apache-2.0
  ([Restate LICENSE](https://github.com/restatedev/restate/blob/main/LICENSE), 2026-10-07).
- **DBOS.** It is an MIT library on Postgres with no extra server. Bun is unsupported: its `engines`
  field requires `node >=20`, and its CI tests Node 20, 22 and 24 only
  ([DBOS CI](https://github.com/dbos-inc/dbos-transact-ts/blob/main/.github/workflows/test.yml),
  2026-10-07). A waiting task keeps a process polling, and its versions need managing by hand after
  each deploy.

## Consequences

- nixie owns leases, durable timers, retries, wake-ups and a run viewer, with crash tests for each.
  The estimate is 800 to 1,500 lines, and no prototype has tested that figure.
- [0025](./0025-database-and-topology.md) puts the event log on SQLite for the first version.
