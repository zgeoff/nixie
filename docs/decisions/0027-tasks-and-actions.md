# 0027: Tasks and actions

- Date: 2026-10-09
- Updated: 2026-10-15
- Status: decided
- Design: [tasks](../design/platform/core/tasks.md), [actions](../design/platform/core/actions.md)

nixie settles the shape of tasks and job runs as follows. Where an unknown outcome goes is set by
[0021](0021-action-outcomes.md).

- **Pause, stop and close.** Pause freezes a task in place: its proposals keep waiting, its queued
  actions hold, and resume carries on. Stop ends the current task run, withdraws its proposals and
  cancels its actions that have not started, while an action that has started runs to an outcome.
  You can restart a stopped task from its last committed step, with its context. Close ends a task
  for good, and the task stays visible in the live view and the record.
- **Trigger details in every job run.** Each job run gets when it was scheduled, when it started,
  whether it is a catch-up, and which scheduled times were skipped. A scheduled time missed while
  nixie was down gets one catch-up job run when the latest missed time is within half the job's
  interval, and otherwise nixie skips it and reports the skip. Each job can set another rule.

## Why

- Pause keeps work you still want. Stop leaves nothing acting for a task run you ended, and the
  restart keeps the context. Close keeps the record of work you are done with.
- A job run that knows it started late can say so, instead of a model guessing the time it was meant
  to run. One catch-up keeps a late morning report useful without flooding you after an outage.

## Alternatives

- **Stop that leaves proposals and queued actions waiting.** It keeps work you may still want, at
  the cost of proposals from a task you stopped.
- **Running every missed job run, or none.** Every one floods you after an outage, and none loses a
  report that is still useful an hour late.

## Consequences

- The client renders a stopped task with a restart action and a closed task as read-only.

## Changes

- 2026-10-15: the choice that unknown outcomes lead the approval digest moved to 0021.
