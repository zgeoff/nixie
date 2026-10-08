# Tasks

- Status: Proposed
- Decisions: [0001](../../decisions/0001-durable-layer.md),
  [0002](../../decisions/0002-approvals.md), [0005](../../decisions/0005-effects-and-taint.md),
  [0015](../../decisions/0015-taint-scope.md), [0018](../../decisions/0018-main-thread-and-tasks.md)

A task is durable work with its own context, such as "keep the backlog moving today", and nixie runs
each one as an explicit state machine over the [event log](./event-log.md), under
[0001](../../decisions/0001-durable-layer.md). A runner holds a lease on a task and runs one step at
a time, and a step is usually one model turn. A task that waits on a proposal, a timer or a message
holds no process, so it survives any restart or deploy. The conversation routes the owner's messages
to tasks from the task board, a job's schedule starts a task for each run, and a worker is a tool
call that runs inside one step in its own imp. Everything in this doc beyond the decisions it links
is a proposal, and the state names are this design's, not a decision's.

## States

A task is in one state at a time, held in its row of the task state projection. The states extend
the sketch in the
[2.2 and 2.3 landscape](../../research/2.2-2.3-core-and-policy.md#durable-execution) with the
owner's pause and stop from the [scope](../../scope.md).

| State     | Meaning                                           | Leaves on                              |
| --------- | ------------------------------------------------- | -------------------------------------- |
| `ready`   | Has unread input and no lease                     | A runner claims it                     |
| `running` | A runner holds its lease and runs a step          | The step commits, or the lease expires |
| `waiting` | Has open waits and no unread input                | An event arrives for one of its waits  |
| `paused`  | The owner paused it, effective after the step     | The owner resumes it                   |
| `done`    | Finished, with a final report to the conversation | Never                                  |
| `failed`  | Stopped by an error that retries did not clear    | The owner retries it                   |
| `stopped` | The owner stopped it                              | Never                                  |

Each task has an inbox: the records addressed to it that it has not read yet, found by a read cursor
on the task row. Owner messages, approvals, lapsed proposals, fired timers and outside action
outcomes all land in the inbox as records. A step reads everything in the inbox, and its commit
moves the cursor.

A waiting task holds a set of open waits, each naming what it waits on: a proposal ID, a timer ID or
an owner reply. A task with open waits and other work to do stays `ready`, because a proposal never
blocks the work around it ([0011](../../decisions/0011-memory-writes.md) states this for memory, and
the same holds for every proposal).

## Steps and leases

A step is the unit of progress. A turn step runs `query()` with `resume` on the task's SDK session,
gives the model the inbox as its input, and ends at the result, so the SDK session is the turn's
checkpoint. A nixie step runs without the model, such as recording a lapsed proposal.

Each step is a row keyed by task ID and step key, and the step commits its result, its records, the
next state and the moved inbox cursor in one transaction. A second commit for the same key fails on
the key, so a step never commits twice.

A runner claims a task with a lease: it sets itself as holder, an expiry, and a lease generation one
higher than the last. The runner extends the lease while the step runs. Every write the step makes
checks the generation, so a runner whose lease expired and passed to another cannot commit. The
claim differs by database:

- **Postgres:** `SELECT … FOR UPDATE SKIP LOCKED` picks a ready task that no other runner is
  claiming.
- **SQLite:** a `BEGIN IMMEDIATE` transaction with a conditional `UPDATE … RETURNING` serialises
  claims, since SQLite allows one writer
  ([storage notes](../../research/2.4-notes/data-and-storage.md#the-queue-pattern-on-each)).

A runner learns of new ready tasks through the same wake-up as the live view: LISTEN and NOTIFY on
Postgres, an in-process signal on SQLite, and polling as the fallback on both.

## Waits

**Proposals.** A tool that needs approval creates the proposal in its own committed transaction, so
the owner sees it at once, and returns "pending approval as <id>" to the model, under
[0002](../../decisions/0002-approvals.md). The step then adds the proposal to the task's open waits.
An approval that arrives before the step commits is already a record in the inbox, so the step's
commit sees unread input and leaves the task `ready` instead of `waiting`. The inbox therefore
buffers an approval that arrives before its wait registers, which the durable layer item in
[open items](../open-items.md#phase-3-design-tasks) asks about.

**Lapses.** Each proposal gets a timer at creation for the lapse that
[0006](../../decisions/0006-approval-record.md) requires. When the timer fires, nixie records the
lapse, closes the proposal and puts the lapse record in the task's inbox, so the task's next turn
learns of it. The lapse time itself is open.

**Timers.** A durable timer is a row with a due time and the record to write when it fires. A
sweeper fires every due timer in a transaction that writes the record and removes the timer. A timer
that fell due while nixie was down fires late, and its record holds both times, which feeds the
report of late triggers.

**Owner messages.** nixie writes each owner message to the log first. When the task is `running`,
nixie also passes the message into the live session with `streamInput()`; otherwise the message
waits in the inbox for the next turn. The research found that the `now` priority does not interrupt
at once ([2.2 and 2.3 landscape](../../research/2.2-2.3-core-and-policy.md#owner-messages)), and the
[owner input spike](../open-items.md#spikes-to-run) settles which priority nixie uses.

## Routing from the conversation

The design runs the conversation as a task that never ends, an
[owner option](#options-for-the-owner), and the owner's messages land in its inbox by default. A
message the owner sends while a task is open in the client goes straight to that task.

The conversation's turn receives the task board in its newest turn, after the stable part of the
prompt, so the prompt cache holds under [0024](../../decisions/0024-memory-in-context.md). Routing
uses 2 of nixie's tools: one passes a message to an existing task, and one starts a task with a
brief. Each call writes a routing record that names the message and the task, and the conversation's
reply names where it sent the message, as [0018](../../decisions/0018-main-thread-and-tasks.md)
requires. The client shows the routing record on the message, so the owner can move a misrouted
message to another task with one action.

A task reports back by writing a report record, and the conversation's next turn reads it from its
inbox. The conversation never waits on a task.

## Job runs

A job is a definition: a schedule, instructions, a tool list and allowed destinations, as separate
fields under [0015](../../decisions/0015-taint-scope.md). The schedule is a trigger source under
[0016](../../decisions/0016-own-interfaces.md). When it fires, nixie creates a task for the run with
the job's definition version pinned for the task's life, under
[0013](../../decisions/0013-definition-versioning.md). The run can call only the tools on the job's
list, and the first build treats every run as untrusted. A fire missed while nixie was down is
recorded as skipped or late.

## Workers

A worker is disposable work behind one tool call, such as "read this page and return the price". It
runs inside the calling step, has no conversation, and returns a result to its caller.

Each worker run gets its own imp, which starts in about 350 ms, under
[0005](../../decisions/0005-effects-and-taint.md). The imp gets no credential grant, under
[0007](../../decisions/0007-grants-and-taint.md), and the worker reaches anything outside through
nixie's tools, where the destination limits apply. The worker holds a subset of its caller's tools,
so delegation only narrows. Its transcript and sources become records whose parent is the tool call.
The imp is destroyed when the tool call returns.

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
The inbox cursor did not move, so the rerun would also deliver inbox records the model already read
in the partial turn.

Each step commit therefore records the ID of the last SDK session message the turn wrote, as the
task's session boundary. The rerun branches the session at that boundary, which drops the partial
turn, and gives the model the unread inbox plus a record that lists each outside action the
interrupted turn started, with its outcome. The model reads which actions ran, so it has no reason
to call them again. When it does call one again, the tool finds the existing action by its action
hash within the task and returns that action's outcome instead of queuing a second one. Crash tests
at each point confirm that a resumed turn never repeats an outside action that ran.

## Options for the owner

- **The database.** The claim and the wake-up differ as shown under steps and leases, and the
  [event log doc](./event-log.md#options-for-the-owner) holds the trade-off.
- **Where a worker's model runs.** The SDK can run inside the worker's imp and reach nixie's tools
  over HTTP MCP, which puts the whole worker behind the imp boundary but inherits the open question
  of how a sandboxed session reaches nixie's endpoint without reaching imp's management API
  ([0003](../../decisions/0003-sdk-placement.md)). Or the worker's loop runs on the host with only
  nixie's tools, and the imp holds the code and fetches the worker runs. The recommendation is the
  host loop for the first build, because it needs no endpoint exposure, with the imp for everything
  the worker executes.
- **The conversation as a task.** Running the conversation on the task machinery gives it leases, an
  inbox and crash recovery for free, at the cost of a special case in the board, which hides it. A
  separate loop keeps the task model pure and duplicates that machinery. The recommendation is the
  conversation as a task.

## Open questions

- How long a proposal stays open before it lapses, carried over from
  [open items](../open-items.md#phase-3-design-tasks).
- Whether a job fire missed while nixie was down runs once on restart, runs for every missed fire,
  or only reports, and whether that is set per job.
- How long a lease lasts and how often the runner extends it, which the crash tests tune.
- What stopping a task does to its open proposals and its queued outside actions: withdraw and
  cancel, or leave them for the owner.
- What limits a worker's time and cost, which joins the open question of budgets and the spending
  stop.
- How long the action-hash lookup reaches back, so that a deliberate repeat of the same action later
  in a task is not mistaken for a retry.
- Whether the Agent SDK can branch a session at a given message, or nixie rebuilds the session from
  the log after a crash, which a spike checks before the crash tests.
