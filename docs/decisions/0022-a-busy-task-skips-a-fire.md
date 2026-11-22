# 0022: A task that is still busy skips a trigger's fire

- Date: 2026-11-22
- Status: decided

## Decision

A [task definition](../architecture/core/definitions.md) is a task that a trigger, such as a
schedule or a webhook, starts again and again. Each time the trigger fires, nixie records a fire,
and the fire opens a task run of the definition's task. When a fire arrives while the task's last
task run is still pending or working, nixie records the fire as skipped and never queues it for
later.

## Why

- Each task has one thread, where its task runs write their records. Two task runs of one task at
  once would write to that thread together.
- With a queue, a task run that never ends would let fires pile up behind it, and no error would
  show. nixie records each skip instead, so a task run that never ends shows as a string of skipped
  fires.

## Rejected alternatives

| Option                                  | Why not                                                |
| --------------------------------------- | ------------------------------------------------------ |
| queue each fire until the task run ends | A task run that never ends leaves a queue nobody sees. |
| open a second task run beside the first | Both task runs write to the task's thread at once.     |

## Consequences

- A schedule that fires more often than its task runs finish starts fewer task runs than it fires.
