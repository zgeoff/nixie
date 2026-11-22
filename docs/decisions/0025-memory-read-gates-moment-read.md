# 0025: `memory: read` gates reading a kept moment

- Date: 2026-11-22
- Status: decided

## Decision

`moment.read` reads a kept moment's span on whichever thread the moment belongs to. A task holds the
tool only when its start sets `memory: read`, and the log grant, which lets a task read other
threads, plays no part. [Moments](../architecture/memory/moments.md) covers the moment tools.

## Why

- A kept moment is memory: the user or the model chose to keep it. The setting that decides which
  task reads memory decides which task reads moments too, so one setting covers both.
- A moment's span sits on the thread it was kept from. Gating it by the log grant would let any task
  with that grant read every kept moment, and block a task with `memory: read` from a moment on
  another thread.

## Rejected alternatives

| Option                                          | Why not                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| gate `moment.read` by the log grant             | Reading memory would then hang on a grant that is about threads.                   |
| let `moment.read` read only the caller's thread | A task could not read a moment kept on another thread, such as the conversation's. |

## Consequences

- To stop a task from reading kept moments, leave `moment.read` out of its tools.
