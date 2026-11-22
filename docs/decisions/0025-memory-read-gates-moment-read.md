# 0025: `memory: read` gates reading a kept moment

- Date: 2026-11-22
- Status: decided

## Decision

A [kept moment](../architecture/memory/moments.md) is a stretch of a thread that the user or the
model chose to keep, with a title. The `moment.read` tool returns that stretch from the thread it
was kept on, whichever thread that is. nixie gives a started task the tool only when the call that
starts the task sets `memory: read`. Whether the task may read other threads, which a separate log
grant decides, has no effect on `moment.read`.

## Why

- A kept moment is part of what nixie remembers, so the setting that lets a task read memory is the
  setting that lets it read kept moments.
- A moment can be kept from any thread, such as the conversation's. Gating `moment.read` on the log
  grant would give every task with that grant every kept moment, and would keep them from a task
  that has only `memory: read`.

## Rejected alternatives

| Option                                            | Why not                                                           |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| gate `moment.read` on the log grant               | Access to memory would then depend on access to threads.          |
| let `moment.read` read only the task's own thread | A task could not read a moment kept on the conversation's thread. |

## Consequences

- A task started with `memory: read` can still be kept from moments: leave `moment.read` out of the
  tools its start names.
