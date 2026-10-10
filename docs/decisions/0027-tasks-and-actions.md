# 0027: Tasks and actions

- Date: 2026-10-09
- Status: decided
- Design: [tasks](../design/core/tasks.md), [actions](../design/core/actions.md)

nixie settles the shape of tasks and actions as follows:

- **Pause, stop and close.** Pause freezes a task in place: its proposals keep waiting, its queued
  actions hold, and resume carries on. Stop ends the current task run, withdraws its proposals and
  cancels its actions that have not started, while an action that has started runs to an outcome.
  You can restart a stopped task from its last committed step, with its context. Close ends a task
  for good, and the task stays visible in the live view and the record.
- **Trigger details in every job run.** Each job run gets when it was scheduled, when it started,
  whether it is a catch-up, and which scheduled times were skipped. A scheduled time missed while
  nixie was down gets one catch-up job run when the latest missed time is within half the job's
  interval, and otherwise nixie skips it and reports the skip. Each job can set another rule.
- **Unknown outcomes lead the approval digest.** An action whose outcome is unknown and that
  reconciliation cannot settle leads the approval digest from [0006](./0006-approval-record.md).

## Why

- Pause keeps work you still want. Stop leaves nothing acting for a task run you ended, and the
  restart keeps the context. Close keeps the record of work you are done with.
- A job run that knows it started late can say so, instead of a model guessing the time it was meant
  to run. One catch-up keeps a late morning report useful without flooding you after an outage.
- An unknown outcome may be a fault, so it leads the place where you settle waiting items.

## Alternatives

- **Stop that leaves proposals and queued actions waiting.** It keeps work you may still want, at
  the cost of proposals from a task you stopped.
- **Running every missed job run, or none.** Every one floods you after an outage, and none loses a
  report that is still useful an hour late.
- **Unknown outcomes apart from the approval digest.** They stand out, and you settle waiting items
  in 2 places.

## Consequences

- The client renders a stopped task with a restart action and a closed task as read-only.
