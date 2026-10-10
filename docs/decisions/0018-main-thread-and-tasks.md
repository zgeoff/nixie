# 0018: The conversation and tasks

- Date: 2026-10-08
- Status: decided
- Design: [tasks](../design/core/tasks.md), [live view](../design/channels/live-view.md)

You work through the conversation by default. The conversation acts as a chief of staff: it handles
the work without you having to manage it, and it shows everything when you ask. If you regularly
have to open a task to get work done, the design has failed.

## The conversation, tasks and workers

- **The conversation** is your chat with nixie. It holds summaries, questions and proposals from
  tasks, not their raw work. It is itself a task that never closes, under
  [0027](./0027-tasks-and-outside-actions.md).
- **A task** is a durable piece of work with its own context, tools and record, such as "keep the
  backlog moving today". It lasts from minutes to days, can wait and wake, and reports to the
  conversation. You can open a task and talk inside it to steer it, in the same view as the
  conversation.
- **A worker** is a disposable unit of work behind a tool call, such as "read this page and return
  the price". It has no conversation, returns a result to its caller, and is part of its caller's
  record. A task can start workers, and a worker starts nothing.

The test between the two: if you might want to talk to it, or it needs to wait for something, it is
a task. Otherwise it is a worker.

## Routing and views

The conversation routes your messages to the right task, and says in a few words where it sent each
one, such as "passed to the backlog task". It works from a short structured list of every task with
its status, last update and what it waits on, the `task_board` projection, instead of holding the
tasks in its context.

The dashboard and the live view read that same projection. The dashboard shows every task and its
controls. The live view adds tasks that are finishing or finished, and what each did and why. Tasks
are state machines over the event log from [0001](./0001-durable-layer.md), so both views are
projections of data nixie already keeps.

## Why

- Several agents joined by hand to share context is the way of working nixie replaces. A design that
  needs you in tasks repeats it.
- Separate contexts keep the conversation small, so compaction does not discard what you care about,
  and let each task hold only the tools it needs under [0015](./0015-taint-scope.md).
- Naming where a message went keeps the conversation's handling visible without asking you to manage
  it, and makes a misrouted message easy to catch.
- One projection behind the conversation's list and both views stops them from disagreeing.

## Alternatives

- **One thread for everything.** Task work fills the conversation, and compaction loses your
  context.
- **Tasks as the default way to work.** It repeats the way of working nixie replaces.

## Consequences

- Routing quality is on the critical path: a misrouted message fails quietly unless the conversation
  names where it sent it.
- The conversation and tasks report asynchronously, so the conversation never blocks on a task.
- A supervised agent, such as a coding session started through atc, runs under its own rules.
  Managing atc sessions is a high priority. Showing supervised agents in the live view, labelled as
  outside nixie, is a low priority.
- Authority given in the conversation for a period, such as "full authority to build and ship
  today", is a mandate: rules that share an expiry. Creating one widens rules, so it asks.
