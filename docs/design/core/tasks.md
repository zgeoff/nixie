# Tasks

- Status: Proposed
- Decisions: [0001](../../decisions/0001-durable-layer.md),
  [0002](../../decisions/0002-approvals.md), [0005](../../decisions/0005-effects-and-taint.md),
  [0015](../../decisions/0015-taint-scope.md), [0016](../../decisions/0016-own-interfaces.md),
  [0018](../../decisions/0018-main-thread-and-tasks.md),
  [0025](../../decisions/0025-database-and-topology.md),
  [0026](../../decisions/0026-where-workers-and-the-conversation-run.md),
  [0027](../../decisions/0027-tasks-and-outside-actions.md)

A task is durable work with its own context, such as "keep the backlog moving today", and nixie runs
each one as an explicit state machine over the [event log](./event-log.md), under
[0001](../../decisions/0001-durable-layer.md). A runner holds a lease on a task and runs one step at
a time, and a step is usually one model turn. A task that waits on a proposal, a timer, a message or
a trigger event holds no process, so it survives any restart or deploy. The conversation routes the
owner's messages to tasks from the task board, a job's schedule starts a task for each run, and a
worker is a tool call that runs inside one step, entirely inside its own imp. Everything in this doc
beyond the decisions it links is a proposal, and the state names are this design's, not a
decision's.

## States

A task is in one state at a time, held in its row of the task state table. The states extend the
sketch in the [2.2 and 2.3 landscape](../../research/2.2-2.3-core-and-policy.md#durable-execution)
with the owner's pause, stop and close.

| State     | Meaning                                            | Leaves on                              |
| --------- | -------------------------------------------------- | -------------------------------------- |
| `ready`   | Has unread input and no lease                      | A runner claims it                     |
| `running` | A runner holds its lease and runs a step           | The step commits, or the lease expires |
| `waiting` | Has open waits and no unread input                 | An event arrives for one of its waits  |
| `paused`  | Frozen in place by the owner                       | The owner resumes it                   |
| `stopped` | Its run ended by the owner, restartable            | The owner restarts or closes it        |
| `failed`  | Ended by an error that retries did not clear       | The owner restarts or closes it        |
| `done`    | Finished, with a final report to the conversation  | The owner closes it                    |
| `closed`  | Ended for good, and still visible in the live view | Never                                  |

Each task has an inbox: the records addressed to it that it has not read yet, found by a read cursor
on the task row. Owner messages, approvals, lapsed proposals, fired timers and outside action
outcomes all land in the inbox as records. nixie passes each inbox record's ID as the SDK message
`uuid`, and matches the SDK's read acknowledgement to that ID. A step's commit marks only the
records that the model read. The cursor advances over contiguous read records; unread gaps stay
eligible for delivery. A crash before commit leaves those records unread for the rerun.

A waiting task holds a set of open waits, each naming what it waits on: a proposal ID, a timer ID,
an owner reply or a trigger event matcher. A task with open waits and other work to do stays
`ready`, because a proposal never blocks the work around it
([0011](../../decisions/0011-memory-writes.md) states this for memory, and the same holds for every
proposal).

## Pause, stop and close

The owner controls a task with 3 actions under
[0027](../../decisions/0027-tasks-and-outside-actions.md), each a checked action in the client with
its own record:

- **Pause** freezes the task in place after the current step commits. Its proposals keep waiting,
  its queued outside actions hold, and no runner claims it. Resume returns it to `ready` or
  `waiting`, and the task carries on as if it had not paused.
- **Stop** ends the current run. nixie aborts a running step, withdraws the task's open proposals
  and cancels its outside actions that have not started an attempt. An action that has started an
  attempt runs to an outcome, which still reaches the record. The owner can restart a stopped task
  from its last committed step, with its context, through the same session branch that
  [crash recovery](#crash-recovery) uses.
- **Close** ends the task for good. A closed task takes no messages and starts nothing, and it stays
  in the live view and the record like any finished task.

## Steps and leases

A step is the unit of progress. A turn step runs `query()` with `resume` on the task's SDK session,
gives the model the inbox as its input, and ends at the result, so the SDK session is the turn's
checkpoint. A nixie step runs without the model, such as recording a lapsed proposal.

Each step is a row keyed by task ID and step key, and the step commits its result, its records, the
next state and the moved inbox cursor in one transaction. A second commit for the same key fails on
the key, so a step never commits twice.

A runner claims a task with a lease: it sets itself as holder, an expiry, and a lease generation one
higher than the last. The claim runs in a `BEGIN IMMEDIATE` transaction with a conditional
`UPDATE … RETURNING`, so SQLite's single writer serialises claims, under
[0025](../../decisions/0025-database-and-topology.md). A lease lasts 60 s by default, and the runner
renews it every 20 s while the step runs. **Why:** a turn takes seconds to minutes, renewing at a
third of the lease survives 2 missed renewals, and a dead runner frees its task within a minute.
Every write the step makes checks the generation, so a runner whose lease expired and passed to
another cannot commit.

A runner learns of new ready tasks by watching the database's WAL file, with polling as the
fallback, under 0025. On Postgres, which 0025 keeps for a second host, the claim becomes
`SELECT … FOR UPDATE SKIP LOCKED` and the wake-up becomes `LISTEN`.

## Waits

**Proposals.** A tool that needs approval creates the proposal in its own committed transaction, so
the owner sees it at once, and returns "pending approval as <id>" to the model, under
[0002](../../decisions/0002-approvals.md). The step then adds the proposal to the task's open waits.
An approval that arrives before the step commits is already a record in the inbox, so the step's
commit sees unread input and leaves the task `ready` instead of `waiting`. The inbox therefore
buffers an approval that arrives before its wait registers.

**Lapses.** Each proposal gets a timer at creation for the lapse that
[0006](../../decisions/0006-approval-record.md) requires. A proposal lapses after 72 hours by
default, and the owner can set another time per effect. **Why:** 72 hours spans a weekend away, and
an action approved later than that, such as a reply, is likely stale, while the model can propose it
again. When the timer fires, nixie records the lapse, closes the proposal and puts the lapse record
in the task's inbox, so the task's next turn learns of it. An owner defer under
[0029](../../decisions/0029-channels-and-clients.md) extends that lapse and sets a resurface timer,
never past the action's real deadline. The defer event joins the task's inbox without closing the
proposal or authorizing its action.

**Timers.** A durable timer is a row with a due time and the record to write when it fires. A
sweeper fires every due timer in a transaction that writes the record and removes the timer. A timer
that fell due while nixie was down fires late, and its record holds both times, which feeds the
report of late triggers.

**Owner messages.** nixie writes each owner message to the log first. When the task is `running`,
nixie also passes the message into the live session with `streamInput()`; otherwise the message
waits in the inbox for the next turn. The record ID becomes its SDK message `uuid`, so a step's
commit marks only the messages it read. `next` is the default, with an explicit interrupt control;
[the client](../channels/client.md#messages-into-a-running-task) records the spike's evidence and
the cases still untested.

**Trigger events.** A task can wait on a typed trigger event matcher as a fourth wait kind. The
[trigger source](../channels/trigger-source.md) writes the event to the log and each matching task's
inbox in the same transaction as its dedupe key and cursor. Events that arrive before wait
registration stay eligible from the step's captured sequence, so registration cannot lose an event.

## Routing from the conversation

The conversation is a task under [0027](../../decisions/0027-tasks-and-outside-actions.md): it runs
on the same state machine, leases, crash recovery and live view, flagged as the conversation, and it
never closes. It lives in a long-lived imp that stays awake, under
[0026](../../decisions/0026-where-workers-and-the-conversation-run.md). The owner's messages land in
its inbox by default. A message the owner sends while a task is open in the client goes straight to
that task.

The conversation's turn receives the task board in its newest turn, after the stable part of the
prompt, so the prompt cache holds under [0024](../../decisions/0024-memory-in-context.md). Routing
uses 2 of nixie's tools: one passes a message to an existing task, and one starts a task with a
brief. Each call writes a routing record that names the message and the task, and the conversation's
reply names where it sent the message, as [0018](../../decisions/0018-main-thread-and-tasks.md)
requires. The client shows the routing record on the message, so the owner can move a misrouted
message to another task with one action.

Moving a message is a checked owner action. Its correction record holds the message ID, source task
and destination task. One transaction updates the routing projection, puts a correction in the
source inbox and puts the message in the destination inbox. The source learns to drop work on the
moved message; the move does not undo an outside action that already started. Original records
remain unchanged. The client shows the correction through
[the routing mark](../channels/live-view.md#routing-marks).

A task reports back by writing a report record, and the conversation's next turn reads it from its
inbox. The conversation never waits on a task.

## Job runs

A job is a definition: a schedule, instructions, a tool list and allowed destinations, as separate
fields under [0015](../../decisions/0015-taint-scope.md). The schedule is a trigger source under
[0016](../../decisions/0016-own-interfaces.md). When it fires, nixie creates a task for the run with
the job's definition version pinned for the task's life, under
[0013](../../decisions/0013-definition-versioning.md). The run can call only the tools on the job's
list, and the first build treats every run as untrusted.

Every run gets its trigger details in its context, under
[0027](../../decisions/0027-tasks-and-outside-actions.md): when it was scheduled, when it started,
whether it is a catch-up, and which fires were skipped. **Why:** a morning report that starts at
10:40 instead of 7:00 can say so, and the model never guesses the time it was meant to run.

A fire missed while nixie was down gets one catch-up run when the latest missed fire is within half
the job's interval, and otherwise nixie skips it and reports the skip. The owner can set another
rule per job. **Why:** running every missed fire floods the owner after an outage, while skipping
them all loses a report that is still useful an hour late.

## Workers

A worker is disposable work behind one tool call, such as "read this page and return the price". It
runs inside the calling step, has no conversation, and returns a result to its caller.

Each worker run gets its own imp under
[0026](../../decisions/0026-where-workers-and-the-conversation-run.md), and the whole worker runs
inside it: the model loop through the Agent SDK and any code it runs. nixie creates and destroys the
imp through the sandbox adapter from [0016](../../decisions/0016-own-interfaces.md), with imp as the
reference adapter. The imp's one credential grant is the model credential, which the broker injects
on the model provider's host, so the guest holds only a placeholder. That grant is limited to the
model API's host, and 0026 amends [0007](../../decisions/0007-grants-and-taint.md) to allow it. The
worker reaches anything else outside through nixie's tools on the host, where the destination limits
apply. The worker holds a subset of its caller's tools, so delegation only narrows. Its transcript
and sources become records whose parent is the tool call, and the imp is destroyed when the tool
call returns.

The [imp worker spike](../../../spikes/imp-worker-start/README.md) measured the cost of that
placement:

| Stage                    | Time        |
| ------------------------ | ----------- |
| Create an imp            | 472 ms      |
| Wake a sleeping imp      | 363 ms      |
| Grant a credential       | 64 ms       |
| First text, warm imp     | about 0.8 s |
| First text, fresh worker | 2.5 to 3 s  |

A turn in a warm imp is as fast as one on the host. About 2 s of a fresh worker's start goes to
reading Claude Code and Bun from a cold disk. nixie therefore builds a purpose-built image per kind
of work, with a minimal base, Bun, and the SDK with only the Claude Code build it needs, and
measures start time with the host's page cache warm. 2 imp changes that could remove most of the
remaining cost are in [open items](../open-items.md#candidate-imp-changes).

A worker run stops at 10 min of wall time, 25 model turns or $1 of model cost by default, whichever
comes first, and the owner can set other limits per tool. The runner reads the cost from the SDK's
result for each turn. **Why:** a worker answers one narrow question, such as a price from a page, so
a run past these limits is looping, and the caller gets an error it can act on instead of a silent
spend. These limits sit inside the wider budgets and spending stop, which
[open items](../open-items.md#phase-3-design-tasks) leave to their own design.

A worker is not durable. If the step dies, the worker's imp is destroyed with it, and a rerun of the
step starts a new worker. An outside action the worker caused runs through the outside action queue,
so a new worker never repeats it blindly.

## Crash recovery

A crash stops the steps in flight, and a restart resumes every task from the log. On start, nixie:

1. Expires every lease held by the dead process, which returns those tasks to `ready`.
2. Marks each step that started without a commit as interrupted, with a record.
3. Marks each outside action that started an attempt without a recorded result as unknown, under
   [outside actions](./outside-actions.md).
4. Fires every timer that fell due while it was down.
5. Destroys every imp that belongs to a step that no longer runs.

Resuming the SDK session alone would carry the interrupted turn's partial work. The
[defer and hold spike](../../../spikes/sdk-long-hold/README.md) found that a resumed session keeps
everything the dead turn wrote, with a synthetic "outcome unknown" result for a dangling tool call.
The [resume-at spike](../../../spikes/sdk-resume-at/README.md) found that an aborted turn leaves its
prompt in the session, so a plain resume answers from the turn that never committed. The inbox
cursor did not move either, so the rerun would deliver inbox records twice.

Each step commit therefore records the session's last chain entry as the task's session boundary.
The rerun calls `query()` with `resume`, `resumeSessionAt` set to that boundary and
`forkSession: true`, which drops everything after the boundary and writes to a new session ID that
nixie records on the task. On `@anthropic-ai/claude-agent-sdk` 0.3.293, the resume-at spike showed
that this drops both a completed later turn and an aborted one, and leaves the original session
intact. The SDK's docs require the boundary to be the kept turn's last chain entry, not its last
assistant message, when that turn ends in a tool call, so nixie records the last entry of every
turn. A task that crashes in its first step has no boundary yet, so its rerun starts a fresh session
from the task's brief instead of resuming the old one, and records the new session ID.

The rerun gives the model the unread inbox plus a record that lists each proposal the interrupted
step created, with its status, and each outside action it started, with its outcome. The model reads
which actions ran, so it has no reason to call them again. When it does call one again, the tool
matches it by action hash against 3 sets: proposals and actions started under the interrupted step's
key, proposals in the task that are still open, and actions in the task that are still pending or
unknown. A rerun keeps the step key of the step it replaces, so the first set holds every proposal
and action started by any attempt at that step, however many reruns crash in turn, until a commit
for that key succeeds. A match returns the existing proposal's ID or the existing action's outcome
instead of creating a second one, so the owner never sees 2 approvable proposals for one call. An
action that finished in an earlier committed step is outside all 3 sets, so the model can repeat it
on purpose. Crash tests at each point confirm that a resumed turn never repeats an outside action
that ran.
