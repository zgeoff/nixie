# The live view and the dashboard

- Decisions: [0029](../../decisions/0029-channels-and-clients.md),
  [0018](../../decisions/0018-the-conversation-and-tasks.md),
  [0027](../../decisions/0027-tasks-and-actions.md)

The dashboard shows every task's state and what it waits on, and the live view extends it with
finished tasks and what each did and why. Both read the same projections as the conversation's task
board, so you and the conversation see the same state. The [event log design](../core/event-log.md)
owns the projections, and [tasks](../core/tasks.md) owns routing and task states.

| Tier | View      | Holds                                                                      |
| ---- | --------- | -------------------------------------------------------------------------- |
| 1    | Dashboard | Every task's row, a task opened as a conversation, and the task controls   |
| 2    | Live view | Finished-task history, the skipped or late trigger report, and raw records |

Tier 2 adds views over the same projections and no new data model.

## The dashboard

The dashboard lists the conversation first, then every task in 4 groups: needs you, working, held
(`paused`, `stopped`, `failed`) and finished in the last 7 days. Each row shows the title, state,
last update and what the task waits on, such as "approval: send email". A job run also shows its
scheduled time and whether it is a catch-up. The dashboard filters by job and state.

## A task as a conversation

An open task reads like the conversation: its brief, your messages, the model's replies and its
reports. Each step's work shows as a compact line that expands. A tool call shows the policy
decision and its rule, a worker its question, answer and sources, a proposal its
[card](./approvals.md), an action its recorded outcome, and a memory read or write its items and
versions. Every line offers its raw record, and a record with no renderer still shows by its kind.
**Why:** nothing is hidden. Payloads over 4 KB load on demand.

## Stepping in

A message sent while a task is open goes straight to that task. The task header holds its controls,
each a checked action:

- **Pause** shows "Pause requested" until the current step commits. **Resume** returns the task to
  ready.
- **Stop** first lists the proposals it withdraws, the actions it cancels and any started action,
  which runs to its outcome. A stopped or failed task offers restart.
- **Close** asks once and leaves the task read-only.
- **Interrupt** ends the current turn, so your next message starts the next one.

## Routing marks

Each of your messages in the conversation shows where it went, such as "→ backlog task", as soon as
the routing record commits. A "move" action sends it to another task, back to the conversation or to
a new task, and writes a correction record. The task that lost the message learns you moved it, and
the task that gains it receives it as if routed there first. **Why:** a misrouted message fails
quietly, so it must be quick to see and to fix. Moves also measure routing quality.

## How the client stays current

The client reads the projections it shows and follows the event log from their sequence. Each stream
event carries one record and the projection rows its transaction changed, so the client never folds
the log itself. The stream covers every thread, with full payloads only for the thread on screen. A
payload whose key is destroyed arrives as a gap.

Coding sessions that nixie supervises through atc show later as a fifth dashboard group, labelled as
outside nixie.
