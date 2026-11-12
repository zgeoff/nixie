# Core design

The core covers nixie's durable layer: the event log every part writes to, tasks and the
conversation as state machines over it, the action queue, and the model profiles every model loop
runs on. [0001](../../../decisions/0001-durable-layer.md) records the main choice, and
[tasks](../../../architecture/core/tasks.md) covers the conversation as a task.

- [The event log and records](event-log.md) — what a record holds, append-only semantics,
  projections, export and retention
- [Tasks](tasks.md) — tasks as state machines with leases and an inbox, waits, the conversation's
  task tools, job runs, workers in imps, and crash recovery
- [Actions](actions.md) — the action queue, its outcomes, approval consumption, reconciliation per
  connector, and unknown outcomes
- [Crash tests](crash-tests.md) — what a crash is, the harness hooks and fault points, and the tests
  each slice must pass
- [Model profiles](models.md) — the profile, model roles and their defaults, configuration, and how
  nixie computes model cost
