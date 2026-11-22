# 0022: A task that is still busy skips a trigger's fire

- Date: 2026-11-22
- Status: decided

## Decision

When a trigger fires for a task definition whose task already has a task run pending or open and
active, nixie records the fire as skipped and never queues it. A task therefore holds at most one
unread fire, except after a stop, when it can hold 2.
[Task definitions](../architecture/core/definitions.md) covers when a fire opens a task run.

## Why

- Two task runs of one task at once would write to the same thread.
- A queue of fires would hide a task run that never ends, because the queue grows and nothing fails.

## Rejected alternatives

| Option                                  | Why not                                                             |
| --------------------------------------- | ------------------------------------------------------------------- |
| queue each fire until the task run ends | A task run that never ends leaves a growing queue that nobody sees. |
| open a second task run beside the first | Two task runs write to one thread at once.                          |

## Consequences

- A schedule shorter than its task runs fires less often than its schedule says, and each skip is a
  record the user can see.
