# 0001: nixie owns its durable layer on its own event log

- Date: 2026-10-07
- Status: decided

## Decision

nixie builds its own durable layer on its own event log, and adopts no durable execution engine.
Each long task is an explicit state machine, stored as rows in nixie's database, and a process that
holds a lease runs one step at a time. The designs of Absurd, OpenWorkflow and DBOS serve as
reference, and nixie borrows their semantics without depending on them.

## Why

- The policy decision point, the approval record and the task state share one database and change in
  one transaction.
- nixie's record stays the only log of record.
- A parked task survives any deploy, because no code replays.
- The layer is built from small primitives that nixie owns, and leaving it costs nothing.

## Rejected alternatives

| Option  | Why not                                                                                                                                                                                                                                                                                                                                               |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restate | It suspends a waiting task without holding a process, and its CI tests Bun. It adds a second system and a second log of record, and a handler that waits on an old deployment keeps that deployment running ([Restate versioning](https://docs.restate.dev/services/versioning.md)). Its server licence is BSL 1.1 until each release is 4 years old. |
| DBOS    | It is an MIT library on Postgres with no extra server. It does not support Bun: its `engines` field requires `node >=20`. A waiting task keeps a process polling, and its versions need managing by hand after each deploy.                                                                                                                           |

## Consequences

- nixie owns leases, durable timers, retries, wake-ups and a run viewer, with crash tests for each.
