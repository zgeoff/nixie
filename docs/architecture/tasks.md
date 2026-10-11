# Tasks

`modules/tasks` runs each task as a state machine over the [event log](event-log.md), one step at a
time, under a lease. The conversation is a task with a fixed ID that waits for your messages. The
module holds the one claim path that task steps and [action](actions.md) attempts share, the inbox
and its read cursor, durable timers, crash recovery and the runner pools. Every wait and every lease
reads a clock that the caller passes in, so a crash test controls time.

## States and records

A task's row holds its state. The code reaches 5 of the 8 states in the
[tasks design](../design/platform/core/tasks.md#states):

| State     | Meaning                                  | Leaves on                              |
| --------- | ---------------------------------------- | -------------------------------------- |
| `ready`   | Has work and no lease                    | A runner claims it                     |
| `running` | A runner holds its lease and runs a step | The step commits, or the lease expires |
| `waiting` | Has no unread input                      | A record lands in its inbox            |
| `done`    | Its step returned done                   | Nothing                                |
| `failed`  | Its steps threw too many times in a row  | Nothing                                |

Every change of state is a record on the task's thread, and the task and timer projections fold
those records, so a rebuild gives the live rows. The table's state check lists all 8 design states.
**Why:** SQLite changes a check only by rebuilding the table, and a migration never changes a
released one.

## The inbox

A record is in a task's inbox when its thread is the task and its kind is your message, a fired
timer or an action outcome. Each one raises the task's last inbox sequence, and a waiting task
becomes ready in the same transaction. nixie refuses inbox input for a task that does not exist or
has finished. **Why:** a finished task never runs again, so the input would stay unread.

A step reports the inbox sequences it read, and its commit moves the read cursor over the contiguous
run of them, oldest first. A record read past a gap stays unread. **Why:** a step that crashed
before its commit, or skipped a record, then sees the rest again.

## Steps

A claim takes a ready task, or a running task whose lease expired, and records the step's start with
a step key of the task and the step number. A rerun of an interrupted step keeps its key, and the
claim first marks the lost step interrupted.

A step commit writes the step's records and the next state in one transaction, moves the read cursor
and frees the lease. The commit record carries the step key, which the log holds unique, so a second
commit for the same step fails. The next state is done when the step returned done, ready when it
asked to continue or input stays unread, and waiting otherwise.

A step that throws records the error, and the task backs off before its next claim. A commit that
refuses the step's result, such as a timer due at no time, counts as a step error too. A lost lease
or a stale writer counts as no step error: the runner stops and commits nothing.

## Leases and the claim path

Task steps and action attempts claim through one path. In one write transaction behind the writer
epoch check, the claim finds a candidate and takes its lease with a conditional upsert. The upsert
succeeds only when the lease is free or expired, and it records the holder, the expiry, the writer
epoch and a generation one higher than the last.

- **The generation check.** Every write a step or an attempt makes checks its lease generation
  first, inside its own transaction. A runner whose lease expired, or that another runner claimed
  since, commits nothing.
- **Renewal.** A runner renews its lease at a third of the lease's length, and stops its work when a
  renewal finds the lease gone. **Why:** the lease then survives one missed renewal, and a dead
  runner frees its work within one lease length.
- **Not a projection.** A claim or a renewal changes a lease without a record, so a rebuild leaves
  the leases as they were.

## Timers

A step asks for timers in its result, and its commit sets them. Each due timer fires in its own
transaction with a record that holds the due time and the fire time, so a timer that fell due while
nixie was down fires late, and its record shows both times. The transaction checks the timer again,
so a timer fires once.

## Crash recovery

Recovery runs before any runner starts, in a process that holds the writer lock under a new epoch,
in this order:

1. It frees every lease claimed under an older epoch, and returns each running task to ready.
2. It marks each step that started without a commit interrupted.
3. It marks each action that started an attempt with no result unknown.
4. It fires every timer that fell due while nixie was down.
5. It destroys every sandbox that belongs to a step that no longer runs.

Steps 3 and 5 arrive as dependencies from the server. **Why:** the actions module depends on tasks,
and modules form no cycles, so tasks never imports actions or the sandbox module. Each step writes
nothing on a second run, so the next start finishes a recovery that crashed.

## Runner pools

A runner pool runs a fixed number of runners over one claim function. An idle runner sleeps for the
poll interval unless the pool wakes it. A stop claims nothing new and waits a bounded time for the
work in flight. The task pool runs the step runners and a runner that fires due timers.

## Fault points

Each transition has a fault point from the
[crash tests](../design/platform/core/crash-tests.md#fault-points), where the crash harness holds
the runner and then kills the process or releases it. The fault points exist only in a test build,
and the bundler drops them from the release bundle, so no release code path can stop at one.
