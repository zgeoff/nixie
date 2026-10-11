# Tasks

`modules/tasks` runs each task as a state machine over the [event log](event-log.md), one step at a
time, under a lease. The conversation is a task with the fixed ID `conversation` that waits for your
messages. The module holds the one claim path that task steps and [action](actions.md) attempts
share, the inbox and its read cursor, durable timers, crash recovery and the runner pools. It also
holds the injectable clock and the fault points that the crash tests stop at.

## States and records

A task row in the `tasks` projection holds its state. The code reaches 5 of the 8 states in the
[tasks design](../design/platform/core/tasks.md#states):

| State     | Meaning                                      | Leaves on                              |
| --------- | -------------------------------------------- | -------------------------------------- |
| `ready`   | Has work and no lease                        | A runner claims it                     |
| `running` | A runner holds its lease and runs a step     | The step commits, or the lease expires |
| `waiting` | Has no unread input                          | A record lands in its inbox            |
| `done`    | Its step returned `done`                     | Nothing                                |
| `failed`  | Its steps threw 3 times in a row, by default | Nothing                                |

Every change of state is a record on the task's thread, and the `tasks` and `timers` projections
fold those records, so a rebuild gives the live rows. The records are `task.created`,
`task.step_started`, `task.step_committed`, `task.step_interrupted`, `task.step_errored`,
`task.lease_expired` and `timer.fired`. The table's state check lists all 8 design states. **Why:**
SQLite changes a check only by rebuilding the table, and a migration never changes a released one.

## The inbox

A record is in a task's inbox when its thread is the task's ID and its kind is `owner_message`,
`timer.fired` or `action.outcome`. Each one raises the task's last inbox sequence, and a waiting
task becomes ready in the same transaction. `writeInboxRecords` writes your messages, and it refuses
a record of another kind, for a task that does not exist, or for a task that is `done` or `failed`.
**Why:** a finished task never runs again, so input to it would stay unread.

A step reports the inbox sequences it read, and its commit moves the read cursor over the contiguous
run of them, oldest first. A record read past a gap stays unread. **Why:** a step that crashed
before its commit, or skipped a record, then sees the rest again.

## Steps

`claimTask` claims a ready task, or a running task whose lease expired, and writes
`task.step_started` with the step key `<task ID>:<step number>`. A rerun of an interrupted step
keeps its key, and the claim first marks the lost step interrupted.

`writeStepCommit` writes the step's records, `task.step_committed` and the next state in one
transaction, moves the read cursor and frees the lease. Only `task.step_committed` carries the step
key in its envelope, and the log holds that key unique, so a second commit for the same key fails
with `StepAlreadyCommittedError`. The next state is `done` when the step returned `done`, `ready`
when it returned `continue` or input stays unread, and `waiting` otherwise.

A step that throws writes `task.step_errored`, and the task waits 30 s before its next claim. A
commit that refuses the step's result, such as a timer due at no time, counts as a step error too. A
lost lease or a stale writer counts as no step error: the runner stops and commits nothing.

## Leases and the claim path

`claimLease` is the one claim path. In one write transaction, under `BEGIN IMMEDIATE` and the writer
epoch check, it finds a candidate and takes its row in the `leases` table with a conditional upsert.
The upsert succeeds only when the lease is free or expired, and it records the holder, the expiry,
the writer epoch and a generation one higher than the last.

- **The generation check.** Every write a step or an attempt makes calls `requireLease` first,
  inside its own transaction. A runner whose lease expired, or that another runner claimed since,
  throws `LeaseLostError` and commits nothing.
- **Renewal.** `startLeaseRenewal` renews a 60 s lease every 20 s, and aborts its signal when a
  renewal finds the lease gone. **Why:** renewing at a third of the lease survives 2 missed
  renewals, and a dead runner frees its work within a minute.
- **Not a projection.** A claim or a renewal changes a lease without a record, so a rebuild leaves
  the `leases` table as it was.

## Timers

A step asks for timers in its result, and `task.step_committed` sets them. `runDueTimers` fires each
due timer in its own transaction with a `timer.fired` record that holds the due time and the fire
time, so a timer that fell due while nixie was down fires late, and its record shows both times. The
transaction checks the timer again, so a timer fires once.

## Crash recovery

`runRecovery` runs before any runner starts, in a process that holds the writer lock under a new
epoch, in this order:

1. It frees every lease claimed under an older epoch, and writes `task.lease_expired` for each
   running task, which returns it to `ready`.
2. It writes `task.step_interrupted` for each step that started without a commit.
3. It calls `writeUnknownOutcomes`, which `modules/actions` supplies.
4. It fires every timer that fell due while nixie was down.
5. It calls `removeStaleSandboxes` on the `SandboxCleanup` that the server builds.

Steps 3 and 5 arrive as dependencies from the server. **Why:** `modules/actions` depends on tasks,
and modules form no cycles, so tasks never imports actions or the sandbox module. Each step writes
nothing on a second run, so the next start finishes a recovery that crashed.

## Runner pools

`startRunnerPool` runs a fixed number of runners over one claim function. An idle runner sleeps for
the poll interval, 1 s by default, unless the pool wakes it. A stop claims nothing new and waits up
to 30 s for the work in flight. `startTaskRunners` starts 3 step runners and a runner that fires due
timers on each poll.

## The clock and fault points

Leases, renewals, timers, retry delays and every wait read the `Clock` that the caller passes in.
`systemClock` is the release clock, and `buildTestClock` in `libs/testing` is the clock a test sets
and advances.

Each transition has a fault point ID from the
[crash tests](../design/platform/core/crash-tests.md#fault-points), reached through
`waitAtFaultPoint` inside `if (NIXIE_TEST_BUILD)`. `setFaultPointHandler` installs the crash
harness's handler, and it throws outside a test build. `trigger.deliver.before` has no fault point,
because nixie has no trigger source. `fault-points.test.ts` bundles both modules both ways: the test
build holds every ID, and the release bundle holds none.
