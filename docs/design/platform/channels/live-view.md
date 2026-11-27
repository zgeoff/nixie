# The live view and the dashboard

The dashboard shows every task's state and what it waits on, and the finished ones from the last 7
days. The live view adds the history of tasks that finished earlier, and what each task did and why.
Both read the same projections as the conversation's `tasks.list` tool, so you and the conversation
see the same state. The [event log design](../core/event-log.md) owns the projections, and
[tasks](../core/tasks.md) owns the conversation's task tools and task states.

Read this before you build or change the dashboard, a task's view, the task controls or the stream
the client follows. Then read [the client architecture](../../../architecture/channels/client.md),
which describes what is built, before you change code.

| Tier | View      | Holds                                                                                                   |
| ---- | --------- | ------------------------------------------------------------------------------------------------------- |
| 1    | Dashboard | Every task's row, a task opened as a conversation, and the task controls                                |
| 2    | Live view | History of tasks finished over 7 days ago, the trigger report of skipped and late runs, and raw records |

Tier 2 adds views over the same projections and no new data model. **Why:** one source of state
means the dashboard, the live view and the conversation can never disagree about a task, and tier 2
needs no new storage or migration. A tier 2 view that needs data the projections lack is a change to
the [event log design](../core/event-log.md), not a new store in the client.

## The dashboard

The dashboard lists the conversation first, then every task in 4 groups: needs you, working, held
(`paused`, `stopped`, `failed`) and finished in the last 7 days. A fifth group holds the coding
sessions that nixie supervises through atc, labelled as outside nixie. It is not a task group. Each
row shows the title, state, last update and what the task waits on, such as "approval: send email".
A job run also shows its scheduled time and whether it is a catch-up. The trigger report lists the
scheduled times a job run skipped or ran late, as [tasks](../core/tasks.md) defines a job run's
trigger details. The dashboard filters by job and state.
[The task dashboard](../../../architecture/channels/client.md#the-task-dashboard) describes what is
built, which keeps 3 groups, Conversation, Working and Held.

## A task as a conversation

An open task reads like the conversation: its brief, your messages, the model's replies and its
reports. Each step's work shows as a compact line that expands. A tool call shows the policy
decision and its rule, a worker its question, answer and sources, a proposal its
[card](approvals.md), an action its recorded outcome, and a memory read or write its items and
versions. A record with no renderer still shows by its kind. No line in a task's view offers its raw
record. **Why:** the task view reads like the conversation, and the raw record is a debugging view
that belongs to the live view in tier 2. A raw record is the stored event-log record as written,
with all its fields. Payloads over 4 KB load on demand, which keeps a long task's page small; the
cut size is `payloadClipBytes`, set in the
[API's large payloads](../../../architecture/channels/api.md#large-payloads). The
[client architecture](../../../architecture/channels/client.md#worker-runs-and-large-payloads)
describes the worker line and the load on demand.

## Stepping in

A message sent while a task is open goes straight to that task. The task header holds its controls,
each a checked action:

- **Pause** shows "Pause requested" until the current step commits. **Resume** returns the task to
  ready.
- **Stop** first lists the proposals it withdraws, the actions it cancels and any started action,
  which runs to its outcome. A stopped or failed task offers restart.
- **Close** asks once and leaves the task read-only.
- **Interrupt** ends the current turn, so your next message starts the next one.

## How the client stays current

The client reads the projections it shows and follows the event log from their sequence. Each stream
event carries one record and the projection rows its transaction changed, so the client never folds
the log itself. **Why:** a client that folds the log can drift from the server's projections, so the
server sends the rows and the client replaces them. The stream covers every thread, so a task you
have not opened still updates its dashboard row, with full payloads only for the thread on screen. A
payload whose key is destroyed arrives as a gap.

## After reading

Build tier 1 first: the dashboard, a task as a conversation and the controls. Build tier 2 as views
over the same projections. For the coding-session group, its controls and its stream events, read
[the client doc](../../../architecture/channels/client.md#the-task-dashboard) and
[supervising in the live view](../../../architecture/core/coding-tasks.md#supervising-in-the-live-view).
