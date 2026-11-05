# 0018: The conversation and tasks

- Date: 2026-10-08
- Updated: 2026-11-05
- Status: decided
- Design: [tasks](../design/platform/core/tasks.md),
  [live view](../design/platform/channels/live-view.md)

You work through the conversation by default. The conversation acts as a chief of staff: it handles
the work without you having to manage it, and it shows everything when you ask. If you regularly
have to open a task to get work done, the design has failed.

## The conversation, tasks and workers

- **The conversation** is your chat with nixie. It holds summaries, questions and proposals from
  tasks, not their raw work. It is itself a task, flagged as the conversation, on the same state
  machine, leases and crash recovery as every task, and it never closes. The dashboard shows it
  apart from the other tasks.
- **A task** is a durable piece of work with its own context, tools and record, such as "keep the
  backlog moving today". It lasts from minutes to days, can wait and wake, and reports to the
  conversation. You can open a task and talk inside it to steer it, in the same view as the
  conversation.
- **A worker** is a disposable unit of work behind a tool call, such as "read this page and return
  the price". It has no conversation, returns a result to its caller, and is part of its caller's
  record. A task can start workers, and a worker starts nothing.

The test between the two: if you might want to talk to it, or it needs to wait for something, it is
a task. Otherwise it is a worker.

## Failures of the conversation

A task fails after too many failed steps in a row, and a failed task never wakes. The conversation
is the one exception: it never fails. It retries with a backoff that stops growing at a cap, and
each failure stays in the record. Once its failures in a row reach the limit at which a task would
fail, nixie shows you that it is failing to answer, and the next turn that succeeds clears that.

## Tasks from the conversation, and views

The conversation works with tasks through 3 tools: `task.start` starts a task with a brief,
`task.message` sends a task a message, and `tasks.list` lists the tasks with their state, brief,
last activity and the task each waits on. Tasks report back to the conversation with their own
messages. No task list rides along in each turn, and nixie keeps no record of which task a message
of yours went to. When the conversation needs to know whether a task already covers some work, it
asks `tasks.list`.

The dashboard shows every task and its controls. The live view adds tasks that are finishing or
finished, and what each did and why. Tasks are state machines over the event log from
[0001](0001-durable-layer.md), so both views are projections of data nixie already keeps.

## Why

- Several agents joined by hand to share context is the way of working nixie replaces. A design that
  needs you in tasks repeats it.
- Separate contexts keep the conversation small, so compaction does not discard what you care about,
  and let each task hold only the tools it needs under
  [0005](0005-effects-and-taint.md#where-taint-applies).
- Tasks message the conversation on their own, and the conversation can list them when it needs to,
  so a task list in every turn only grows its context.
- A routing record, a mark on each message and a move action guard against a misrouted message, a
  failure the conversation can catch itself with `tasks.list` and fix with `task.message`. The 3
  task tools cover that need with less to build and run.
- The conversation matters most, so it gets the durable machinery that is tested hardest, with no
  second loop to maintain.
- Every deployment needs the conversation to answer, and a few transient failures in a row, such as
  an overloaded provider or a tool server that restarts, would otherwise end it for good.

## Alternatives

- **One thread for everything.** Task work fills the conversation, and compaction loses your
  context.
- **Tasks as the default way to work.** It repeats the way of working nixie replaces.
- **A separate loop for the conversation.** It keeps the task model free of a special case, and
  duplicates the durable machinery.
- **A new message wakes a failed conversation.** The conversation stays silent until you write
  again, and its failure shows only as silence.
- **A failed conversation waits for an operator.** nixie stops answering until someone resets the
  task by hand.
- **A routing layer over the task tools.** A task board in each turn, a record of the task each
  message went to, a mark beside each message, a move for a misrouted message and a reply that names
  where each message went. It grows every turn's context and adds records, an API action and client
  controls for a failure the task tools already let the conversation fix.

## Consequences

- The conversation decides alone which task gets a message of yours. To see where it went, you ask
  the conversation or open the task.
- The conversation and tasks report asynchronously, so the conversation never blocks on a task.
- A supervised agent, such as a coding session started through atc, runs under its own rules.
  Managing atc sessions is a high priority. Showing supervised agents in the live view, labelled as
  outside nixie, is a low priority.
- Authority given in the conversation for a period, such as "full authority to build and ship
  today", is a mandate: rules that share an expiry. Creating one widens rules, so it asks.

## Changes

- 2026-10-09: the conversation is itself a task, on the same state machine, leases and crash
  recovery as every task.
- 2026-10-14: the conversation never fails; it retries with a capped backoff and shows you once its
  failures in a row reach the limit.
- 2026-11-05: the conversation works with tasks through `task.start`, `task.message` and
  `tasks.list` alone. The task board in each turn, the routing records, the routing marks, the move
  of a misrouted message and the rule that the reply names where a message went are gone.
