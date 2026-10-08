# 0018: The main thread and tasks

- Date: 2026-10-08
- Status: decided
- Research: [2.1 landscape](../research/2.1-landscape.md),
  [2.4 to 2.6 landscape](../research/2.4-2.6-data-channels-connectors.md)

The owner works through the main thread by default. The main thread acts as a chief of staff: it
handles the work without the owner having to manage it, and it shows everything when the owner asks.
If the owner regularly has to open a side thread to get work done, the design has failed.

The terms in this record are provisional. A terminology pass settles them before any code.

## Main thread, tasks and workers

- **The main thread** is the owner's conversation with nixie. It holds summaries, questions and
  proposals from tasks, not their raw work.
- **A task** is a side thread: a durable piece of work with its own context, tools and record, such
  as "keep the backlog moving today". It lasts from minutes to days, can wait and wake, and reports
  to the main thread. The owner can open a task and talk inside it to steer it.
- **A worker** is a disposable job behind a tool call, such as "read this page and return the
  price". It has no conversation, returns a result to its caller, and is part of its caller's
  record. A task can start workers, and a worker starts nothing.

The test between the two: if the owner might want to talk to it, or it needs to wait for something,
it is a task. Otherwise it is a worker.

## Routing

The main thread routes the owner's messages to the right task, and says in a few words where it sent
each one, such as "passed to the backlog task". It works from a live task board, a short structured
list of every task with its status, last update and what it waits on, instead of holding the tasks
in its context. Phase 3 designs the routing.

## The live view

A live view of the system is a requirement. It shows running tasks, tasks that are finishing or
finished, and what each did and why. Tasks are state machines over the event log from
[0001](./0001-durable-layer.md), so the view is a projection of data nixie already keeps. The live
view and the main thread's task board read the same data, so the owner and the main thread always
see the same state.

## Why

- The owner's current way of working, several agents joined by hand to share context, is what nixie
  replaces. A design that needs the owner in side threads repeats it.
- Separate contexts keep the main thread small, so compaction does not discard what the owner cares
  about, and let each task hold only the tools it needs under [0015](./0015-taint-scope.md).
- Naming where a message went keeps the main thread's handling visible without asking the owner to
  manage it, and makes a misrouted message easy to catch.
- One source for the task board and the live view stops the two from disagreeing.

## Alternatives

- **One thread for everything.** Task work fills the conversation, and compaction loses the owner's
  context.
- **Side threads as the default way to work.** It is how the owner works today, and the reason for
  building nixie.

## Consequences

- Routing quality is on the critical path: a misrouted message fails quietly unless the main thread
  names where it sent it.
- The main thread and tasks report asynchronously, so the main thread never blocks on a task.
- An integration may start entities that nixie supervises but that run under their own rules, such
  as coding agent sessions started through atc. Managing atc sessions is a high priority for v1 or
  v2. Showing such entities in the live view as an extension of nixie, labelled as outside nixie, is
  a low priority.
- Authority granted in the conversation for a period, such as "full authority to build and ship
  today", is a rule with an expiry. Widening a rule is in the always-ask set from
  [0005](./0005-effects-and-taint.md), and Phase 3 designs grants with expiries.
- A terminology pass, which may draw on a metaphor such as the chief of staff, comes before any
  code.
