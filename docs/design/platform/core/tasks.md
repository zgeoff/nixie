# Tasks

- Decisions: [0001](../../../decisions/0001-durable-layer.md),
  [0002](../../../decisions/0002-approvals.md),
  [0005](../../../decisions/0005-effects-and-taint.md),
  [0015](../../../decisions/0015-taint-scope.md), [0016](../../../decisions/0016-own-interfaces.md),
  [0018](../../../decisions/0018-the-conversation-and-tasks.md),
  [0025](../../../decisions/0025-database-and-topology.md),
  [0026](../../../decisions/0026-where-workers-and-the-conversation-run.md),
  [0027](../../../decisions/0027-tasks-and-actions.md)

A task is durable work with its own context, such as "keep the backlog moving today", and nixie runs
each one as an explicit state machine over the [event log](event-log.md). A runner holds a lease on
a task and runs one step at a time, and a step is usually one model turn. A task that waits on a
proposal, a timer, a message or a trigger event holds no process, so it survives any restart or
deploy. The conversation routes your messages to tasks, each job run is a task, and a worker runs
inside one step, entirely inside its own imp.

## States

A task is in one state at a time, held in its row of the task state table.

| State     | Meaning                                            | Leaves on                              |
| --------- | -------------------------------------------------- | -------------------------------------- |
| `ready`   | Has unread input and no lease                      | A runner claims it                     |
| `running` | A runner holds its lease and runs a step           | The step commits, or the lease expires |
| `waiting` | Has open waits and no unread input                 | An event arrives for one of its waits  |
| `paused`  | Frozen in place by you                             | You resume it                          |
| `stopped` | Its task run ended by you, restartable             | You restart or close it                |
| `failed`  | Ended by an error that retries did not clear       | You restart or close it                |
| `done`    | Finished, with a final report to the conversation  | You close it                           |
| `closed`  | Ended for good, and still visible in the live view | Never                                  |

Each task has an inbox: the records addressed to it that it has not read, found by a read cursor on
the task row. Your messages, approvals, lapsed proposals, fired timers and action outcomes all land
in the inbox as records. nixie passes each inbox record's ID as the SDK message `uuid`, and a step's
commit marks only the records the SDK acknowledged reading. The cursor advances over contiguous read
records, so a crash before commit leaves the rest unread for the rerun.

A task's open waits each name what the task waits on: a proposal, a timer, your reply or a trigger
event. A task with open waits and other work to do stays `ready`, because a proposal never blocks
the work around it.

## Pause, stop and close

You control a task with 3 checked actions in the client, each with its own record:

- **Pause** freezes the task once the current step commits. Its proposals keep waiting, its queued
  actions hold, and no runner claims it. Resume returns it to `ready` or `waiting`.
- **Stop** ends the current task run. nixie aborts a running step, withdraws the task's open
  proposals and cancels its actions that have not started an attempt. An action with a started
  attempt runs to an outcome, which still reaches the record. Restart resumes the task from its last
  committed step through the same session branch that [crash recovery](#crash-recovery) uses.
- **Close** ends the task for good. A closed task takes no messages and starts nothing, and it stays
  in the live view.

## Recovery holds

A restore or a rollback holds work so that recovered tasks never act before you look. A host restore
holds every unfinished task and every job or trigger launch recovered from the snapshot. A rollback
holds the tasks and launch sources that the discarded span touched. The hold is durable and separate
from the lease and the task state:

- No task claim and no action attempt starts on held work, retries and reconciliation included.
- Inbox delivery, timers and outcome recording still run, so nothing is lost while work waits.
- Only your checked resume of the task, or your re-enable of its job or trigger, clears a hold.

Before it replaces the database, the restore or rollback command writes an incomplete-recovery
marker outside the database. It commits the holds with the recovered database, then clears the
marker before any runner starts, and startup refuses to run while the marker exists.
[Backup and restore](../deployment/backup-and-restore.md) and [upgrades](../deployment/upgrades.md)
use these holds.

## Steps and leases

A step is the unit of progress. A turn step runs `query()` with `resume` on the task's SDK session,
gives the model the inbox as its input, and ends at the result, so the SDK session checkpoints the
turn. A nixie step runs without the model, such as recording a lapsed proposal.

Each step commits its result, its records, the next state and the moved inbox cursor in one
transaction, keyed by task ID and step key. A second commit for the same key fails on the key, so a
step never commits twice.

A runner claims a task with a lease: a holder, an expiry, the
[writer epoch](../../../architecture/database.md#the-single-writer), and a lease generation one
higher than the last, set by a conditional `UPDATE … RETURNING` in a `BEGIN IMMEDIATE` transaction.
A lease lasts 60 s by default, and the runner renews it every 20 s. **Why:** renewing at a third of
the lease survives 2 missed renewals, and a dead runner frees its task within a minute. Every write
a step makes checks the generation, so a runner whose lease expired cannot commit.

## Waits

- **Proposals.** A tool that needs approval commits the proposal in its own transaction, so you see
  it at once, and returns "pending approval as `<id>`" to the model under
  [0002](../../../decisions/0002-approvals.md). An approval that arrives before the step commits is
  already in the inbox, so the commit leaves the task `ready`.
- **Lapses.** A proposal lapses after 72 hours by default, settable per effect, and the lapse record
  joins the task's inbox. **Why:** 72 hours spans a weekend away, and an older approval is likely
  stale. A defer extends the lapse as [channels approvals](../channels/approvals.md) defines, never
  shortens it, and never extends it past the action's `deadlineAt`.
- **Timers.** A durable timer is a row with a due time and the record to write when it fires. A
  timer that fell due while nixie was down fires late, and its record holds both times, which feeds
  the report of late triggers.
- **Your messages.** nixie writes each message to the log first. When the task is `running`, nixie
  also passes it into the live session with `streamInput()`; otherwise it waits in the inbox for the
  next turn. [The client](../channels/client.md) owns the delivery modes.
- **Trigger events.** The [trigger source](../channels/trigger-source.md) writes each event to the
  log and to every matching task's inbox in one transaction with its cursor. An event that arrives
  before a step registers its wait stays eligible from the sequence the step captured, so
  registering a wait never loses an event.

## Routing from the conversation

The conversation is a task that never closes, flagged as the conversation, on the same state
machine, leases and recovery. It lives in a long-lived imp that stays awake under
[0026](../../../decisions/0026-where-workers-and-the-conversation-run.md). Your messages land in its
inbox by default, and a message you send while a task is open in the client goes straight to that
task.

The conversation receives the task board in its newest turn, after the stable part of the prompt, so
the prompt cache holds. It routes with 2 tools: one passes a message to an existing task, and one
starts a task with a brief. Each call writes a routing record, and the conversation's reply names
where it sent the message, as [0018](../../../decisions/0018-the-conversation-and-tasks.md)
requires.

Moving a misrouted message is one checked action in the client, which writes a correction record and
updates both tasks' inboxes in one transaction.

A task reports back with a report record, which the conversation reads from its inbox in its next
turn. The conversation never waits on a task.

## Job runs

A job is a definition: a schedule or trigger, instructions, a tool list and allowed destinations,
under [0015](../../../decisions/0015-taint-scope.md). When its trigger source starts a job run,
nixie creates a task with the job's definition version pinned for the task's life. The job run can
call only the tools on the job's list, and the first build treats every job run as untrusted.

Every job run gets its trigger details in its context: when it was scheduled, when it started,
whether it is a catch-up, and which scheduled times were skipped. **Why:** a morning report that
starts at 10:40 can say so, and the model never guesses when it was meant to run.

A job run missed while nixie was down gets one catch-up when the latest missed time is within half
the job's interval. Otherwise nixie skips it and reports the skip. Each job can set its own rule.
**Why:** running every missed time floods you after an outage, while skipping them all loses a
report that is still useful an hour late.

## Workers

A worker is disposable work behind one tool call, such as "read this page and return the price". It
runs inside the calling step, has no conversation, and returns a result to its caller.

Each worker run gets its own imp through the [sandbox adapter](../connectors/sandbox-adapter.md),
and the whole worker runs inside it: the model loop and any code it runs. The imp's one credential
grant is the model credential of the worker's [model profile](models.md), limited to that profile's
host, under [0026](../../../decisions/0026-where-workers-and-the-conversation-run.md). The worker
reaches anything else through nixie's tools on the host, where the destination limits apply. A
worker holds a subset of its caller's tools, so delegation only narrows. Its transcript becomes
records whose parent is the tool call, and nixie destroys the imp when the tool call returns.

A minimal image per kind of work keeps a fresh worker's start short, as the
[imp worker spike](../spikes/imp-worker-start/README.md) measured.

A worker run stops at the first of its limits: 10 min of wall time, 25 model turns, 500,000 tokens
or $1 of model cost by default, each settable per tool. **Why:** a worker answers one narrow
question, so a worker run past these limits is looping, and the caller gets an error it can act on.
These limits sit inside the [budgets](../policy/budgets.md).

A worker is not durable: a rerun of its step starts a new worker, and the action queue keeps it from
repeating an action.

## Crash recovery

A crash stops the steps in flight, and a restart resumes every task from the log. Recovery runs only
in a process that holds the
[writer lock and a new writer epoch](../../../architecture/database.md#the-single-writer). Before
any task starts, nixie finishes any pending cleanup of invalid transcript copies under
[memory context](../memory/context.md), then:

1. Expires every lease claimed under an older writer epoch. A task without a pause or a recovery
   hold returns to `ready`.
2. Marks each step that started without a commit as interrupted, with a record.
3. Marks each action that started an attempt without a recorded result as unknown, under
   [actions](actions.md).
4. Fires every timer that fell due while nixie was down.
5. Destroys every sandbox that belongs to a step that no longer runs, through its recorded sandbox
   adapter.

Each step commit records the SDK session's last chain entry as the task's session boundary. The
rerun calls `query()` with `resume`, `resumeSessionAt` at that boundary and `forkSession: true`,
which drops everything after the boundary and writes to a new session ID. **Why:** a plain resume
keeps the interrupted turn's partial work and its prompt, so the model would answer from a turn that
never committed ([resume-at spike](../spikes/sdk-resume-at/README.md)). A task that crashes in its
first step has no boundary, so its rerun starts a fresh session from the task's brief.

The rerun gives the model the unread inbox plus the status of each proposal and action the
interrupted step started. A repeat call matches by action hash against everything started under the
step's key and everything still open or unknown in the task, and returns the existing proposal or
outcome instead of a second one. The [crash tests](crash-tests.md) confirm that a resumed turn never
repeats an action that ran.
