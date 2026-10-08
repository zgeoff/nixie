# The live view and the dashboard

- Status: Proposed
- Decisions: [0001](../../decisions/0001-durable-layer.md),
  [0018](../../decisions/0018-main-thread-and-tasks.md),
  [0027](../../decisions/0027-tasks-and-outside-actions.md)

The live view shows every task, running or finished, and what each did and why, and the dashboard is
its short form: the task board as a list. Both read the same projections as the conversation's task
board, under [0018](../../decisions/0018-main-thread-and-tasks.md), so the owner and the
conversation always see the same state. Opening a task shows it as a conversation in the same view
as the main thread, and the owner steps in by writing there or through the task's controls. Each
owner message in the conversation shows where it was routed, and moving a misrouted message is one
action. The [event log design](../core/event-log.md#the-live-view-and-the-task-board) owns the
projections and the follow-by-sequence model, and [tasks](../core/tasks.md) owns routing and the
task states. Everything in this doc beyond the decisions it links is a proposal.

## The dashboard

The dashboard lists the conversation first, apart from the tasks, under
[0027](../../decisions/0027-tasks-and-outside-actions.md), and then every task in 4 groups:

1. **Needs you:** tasks with a proposal, an unknown outcome or a question waiting on the owner.
2. **Working:** tasks that are `ready`, `running` or `waiting` on something other than the owner.
3. **Held:** tasks that are `paused`, `stopped` or `failed`.
4. **Finished:** tasks that are `done` or `closed`, from the last 7 days by default, with the rest a
   search away.

Each row shows the task's title, its state, its last update as a time and one line, and what it
waits on, such as "approval: send email" or "timer: 15:00". A job run also shows its trigger
details: when it was scheduled, when it started, and whether it was a catch-up. A tap opens the
task. The dashboard has a filter by job and by state, and a row for each skipped or late trigger
fire, which feeds the report of skipped or late triggers in tier 2.

## A task as a conversation

An open task reads like the main thread: the brief that started it, the owner's messages, the
model's replies, and the task's reports. Between them, each step's work shows as compact lines that
expand:

- **A tool call** shows the tool and the policy decision, such as "allowed by rule: replies to known
  senders", with the deciding stage. Expanded, it shows the arguments, the result and the rule as
  its sentence, with a link to edit the rule.
- **A worker** shows its question and its answer. Expanded, it shows its transcript and sources.
- **A proposal** shows as an approval card, which [approvals](./approvals.md) covers.
- **An outside action** shows its outcome as nixie recorded it: pending, done, failed or unknown.
- **A memory read or write** shows the items with their versions, with a tap through to each item.

A record the client has no renderer for still shows by its kind, as the event log design requires,
so nothing is hidden by a missing renderer. Every line has a "raw record" action that shows the
record as stored. **Why:** "nothing is hidden" asks for the raw data on request, never a summary.

Expanded payloads load on demand. A tool result or worker transcript can be large, and the stream
carries each record with its payload only up to 4 KB by default, with a read to fetch the rest.

## Stepping in

The owner steps into a task by writing in it. A message sent while a task is open goes straight to
that task, under [tasks](../core/tasks.md#routing-from-the-conversation), and the client shows it in
the task's thread at once with its pending mark.
[The client](./client.md#messages-into-a-running-task) covers when a running task's model reads it.

The task's controls sit in its header, each a checked action with its own record, under
[0027](../../decisions/0027-tasks-and-outside-actions.md):

- **Pause** and **Resume** apply at once, because pause loses nothing.
- **Stop** first shows what it will do: the proposals it withdraws, the outside actions it cancels,
  and any action already started, which runs to an outcome. The owner confirms, and the stopped task
  then shows a restart action.
- **Close** asks for one confirmation, and the closed task becomes read-only.
- **Interrupt** ends the current turn of a running task, so the owner's next message starts the next
  turn.

A failed task shows its error and the same restart and close actions as a stopped one.

## Routing marks

Each owner message in the conversation carries a mark that shows where it went, such as "→ backlog
task", from the routing record. The mark appears as soon as the record commits, before the
conversation's reply names it in words. A message the conversation kept for itself has no mark.

A tap on the mark opens the task. A "move" action on the message lists the open tasks, "keep in the
conversation" and "start a new task", and moving is a checked action that writes a correction
record. The task that lost the message receives a record in its inbox saying the owner moved the
message elsewhere, so its model drops any work on it, and the task that gains it receives the
message as if routed there first. **Why:** [0018](../../decisions/0018-main-thread-and-tasks.md)
puts routing quality on the critical path, and a misrouted message must be cheap to see and to fix.

Every move is a record that holds the message, the task it left and the task it reached, so moves
measure routing quality without a separate log. Whether routing is good enough is a
[spike to run](../open-items.md#spikes-to-run).

## How the client stays current

The client keeps every view current from one stream. On open, it reads the projections it shows,
notes the sequence they reflect, and follows the log from that sequence through the
[typed API](./client.md#the-typed-api). Each event carries one record and the projection rows its
transaction changed, such as the task board row and the proposal row. **Why:** the server writes
those rows in the same transaction as the record, so sending them spares the client a second fold of
the log, and the client cannot drift from the conversation's board.

The stream covers every thread, because the dashboard needs every task's row. A record's full
payload, which can be large, reaches the client only for the thread open on screen; for every other
thread, the stream carries the envelope and the changed rows. After a disconnect, the client resumes
from the last sequence it saw, and the spike showed that resume missed nothing and repeated nothing.

The server decrypts payloads for a signed-in session only, and a payload whose key is shredded
arrives as a gap, as in the [event log design](../core/event-log.md#append-only).

## Outside agents

Coding sessions that nixie starts through atc run under their own rules, and showing them in the
live view is a later stage under [0018](../../decisions/0018-main-thread-and-tasks.md). The
dashboard leaves room for them as a fifth group, labelled as outside nixie, with rows from the
coding agent adapter.
