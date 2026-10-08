# 0027: Tasks and outside actions

- Date: 2026-10-09
- Status: decided
- Amends: [0001](./0001-durable-layer.md), [0018](./0018-main-thread-and-tasks.md),
  [0021](./0021-outside-action-outcomes.md)
- Design: [event log](../design/core/event-log.md), [tasks](../design/core/tasks.md),
  [outside actions](../design/core/outside-actions.md)

nixie settles the shape of tasks and outside actions as follows:

- **State tables beside the log.** Task state, proposals, the outside action queue and the task
  board are tables that nixie writes in the same transaction as the record that changes them. A
  check folds the log from the first record and compares the result with the tables, to prove they
  have not drifted.
- **"Outside action" names a queue entry.** What [0021](./0021-outside-action-outcomes.md) calls a
  job on the queue is an outside action, and "job" keeps its meaning as a definition with a schedule
  under [0015](./0015-taint-scope.md).
- **The conversation is a task.** It runs on the same state machine, leases, crash recovery and live
  view as every task, flagged as the conversation. It never closes, and it routes work to other
  tasks.
- **Pause, stop and close.** Pause freezes a task in place: its proposals keep waiting, its queued
  outside actions hold, and resume carries on. Stop ends the current run, withdraws its proposals
  and cancels its outside actions that have not started, while an action that has started runs to an
  outcome. The owner can restart a stopped task from its last committed step, with its context.
  Close ends a task for good, and the task stays visible in the live view and the record.
- **Trigger details in every run.** Each task run gets when it was scheduled, when it started,
  whether it is a catch-up, and which fires were skipped. A fire missed while nixie was down gets
  one catch-up run when the latest missed fire is within half the job's interval, and otherwise
  nixie skips it and reports the skip. The owner can set another rule per job.
- **Unconfirmed outcomes in the digest.** An outside action whose outcome is unknown and that
  reconciliation cannot settle joins the digest sheet from [0006](./0006-approval-record.md),
  grouped first.
- **The passkey to retry an unknown payment.** Retrying a payment whose outcome is unknown asks for
  the passkey check from [0012](./0012-high-risk-approvals.md) once that check exists, as the first
  approval would.

## Why

- State tables make a claim or a task board read one indexed query, and the rebuild check catches
  the one risk they add: tables that disagree with the log.
- "Job" already names a definition, so a second meaning would make every sentence about queues
  ambiguous.
- The conversation is the thread that matters most, so it gets the durable machinery that is tested
  hardest, with no second loop to maintain.
- Pause keeps work the owner still wants; stop leaves nothing acting for a run the owner ended, and
  the restart keeps the context; close keeps the record of work the owner is done with.
- A run that knows it started late can say so, instead of a model guessing the time it was meant to
  run. One catch-up keeps a late morning report useful without flooding the owner after an outage.
- An unknown outcome may be a fault, so it leads the sheet where the owner settles waiting items.
- A retry of an unknown payment can charge twice, so it carries the risk of the first approval.

## Alternatives

- **State rebuilt from the log on every read.** The two can never disagree, and every claim and
  board read pays for a fold.
- **A separate loop for the conversation.** It keeps the task model free of a special case, and
  duplicates the durable machinery.
- **Stop that leaves proposals and queued actions for the owner.** It keeps work the owner may still
  want, at the cost of proposals from a task the owner stopped.
- **Running every missed fire, or none.** Every fire floods the owner after an outage; none loses a
  report that is still useful an hour late.
- **Unknown outcomes apart from the digest.** They stand out, and the owner settles waiting items in
  2 places.
- **A tap to retry an unknown payment.** It is one step fewer, and lets anyone holding the owner's
  unlocked phone trigger a second charge.

## Consequences

- [0001](./0001-durable-layer.md) gains the rebuild check alongside its crash tests.
- [0018](./0018-main-thread-and-tasks.md): the conversation, which 0018 calls the main thread, is a
  task that the board shows apart from the others.
- [0021](./0021-outside-action-outcomes.md): the docs call each queue entry an outside action.
- The client renders a stopped task with a restart action and a closed task as read-only.
