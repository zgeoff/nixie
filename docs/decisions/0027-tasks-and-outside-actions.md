# 0027: Tasks and actions

- Date: 2026-10-09
- Status: decided
- Design: [tasks](../design/core/tasks.md), [actions](../design/core/outside-actions.md)

nixie settles the shape of tasks and actions as follows:

- **The conversation is a task.** It runs on the same state machine, leases, crash recovery and live
  view as every task, flagged as the conversation. It never closes, and it routes work to other
  tasks.
- **"Action" names a queue entry.** An action is an entry on the action queue, and "job" keeps its
  meaning as a definition with a schedule or trigger.
- **Pause, stop and close.** Pause freezes a task in place: its proposals keep waiting, its queued
  actions hold, and resume carries on. Stop ends the current task run, withdraws its proposals and
  cancels its actions that have not started, while an action that has started runs to an outcome.
  You can restart a stopped task from its last committed step, with its context. Close ends a task
  for good, and the task stays visible in the live view and the record.
- **Trigger details in every task run.** Each job run gets when it was scheduled, when it started,
  whether it is a catch-up, and which scheduled times were skipped. A scheduled time missed while
  nixie was down gets one catch-up job run when the latest missed time is within half the job's
  interval, and otherwise nixie skips it and reports the skip. Each job can set another rule.
- **Unknown outcomes in the approval digest.** An action whose outcome is unknown and that
  reconciliation cannot settle leads the approval digest from [0006](./0006-approval-record.md).
- **The passkey to retry an unknown payment.** Retrying a payment whose outcome is unknown takes the
  passkey check from [0012](./0012-high-risk-approvals.md), as the first approval did.

## Why

- "Job" already names a definition, so a second meaning would make every sentence about queues
  ambiguous.
- The conversation is the thread that matters most, so it gets the durable machinery that is tested
  hardest, with no second loop to maintain.
- Pause keeps work you still want; stop leaves nothing acting for a task run you ended, and the
  restart keeps the context; close keeps the record of work you are done with.
- A job run that knows it started late can say so, instead of a model guessing the time it was meant
  to run. One catch-up keeps a late morning report useful without flooding you after an outage.
- An unknown outcome may be a fault, so it leads the place where you settle waiting items.
- A retry of an unknown payment can charge twice, so it carries the risk of the first approval.

## Alternatives

- **A separate loop for the conversation.** It keeps the task model free of a special case, and
  duplicates the durable machinery.
- **Stop that leaves proposals and queued actions waiting.** It keeps work you may still want, at
  the cost of proposals from a task you stopped.
- **Running every missed job run, or none.** Every one floods you after an outage; none loses a
  report that is still useful an hour late.
- **Unknown outcomes apart from the approval digest.** They stand out, and you settle waiting items
  in 2 places.
- **A tap to retry an unknown payment.** It is one step fewer, and lets anyone holding your unlocked
  phone trigger a second charge.

## Consequences

- The client renders a stopped task with a restart action and a closed task as read-only.
- The dashboard shows the conversation apart from the other tasks.
