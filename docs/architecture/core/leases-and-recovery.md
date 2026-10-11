# Leases and recovery

A runner works on a task step or an action attempt only while it holds that work's lease, and it
proves it still holds the lease inside every transaction that writes. A lease expires unless its
runner renews it, so a runner that dies frees its work within one lease length, and a runner that
was only slow finds its lease gone and commits nothing. Task steps and action attempts claim through
the same path, so both kinds of work follow one set of rules. After a crash, recovery runs before
any runner starts and puts every piece of work that was in flight back into a state a runner can
claim. `modules/tasks` owns the claim path, the runner pools and recovery. [Tasks](./tasks.md) and
[actions](./actions.md) cover the work itself.

## The claim path

A claim runs in one write transaction behind the writer epoch check. Inside it, the claim finds the
next piece of work, then takes its lease with one conditional upsert that succeeds only when the
lease is free or expired. A successful claim records the holder, the expiry, the writer epoch and a
generation one higher than the lease's last. SQLite's write lock serializes every claim against
every other write, so two runners never take the same lease. The claim of a task step records the
step's start in the same transaction, so a lease never exists without the step it covers.

The generation is what makes a lease safe to lose. Every write a step or an attempt makes checks,
first and inside its own transaction, that its lease still stands with the same holder and
generation and has not expired. A runner whose lease expired, or that another runner claimed since,
commits nothing, and its work becomes the other runner's. Freeing a lease at commit clears its
holder and keeps its generation, so the next claim takes the generation after it.

A runner renews its lease at a third of the lease's length. The lease therefore survives one missed
renewal, and a dead runner still frees its work within one lease length. A renewal that finds the
lease gone aborts the work's signal, so a step stops a model turn whose result it can no longer
commit.

Leases sit outside the event log. A claim or a renewal changes a lease without writing a record,
because a lease says who may write now, not what happened. A projection rebuild therefore leaves the
leases as they were.

## Runner pools

A runner pool runs a fixed number of runners over one claim function. An idle runner sleeps for a
poll interval unless the pool wakes it. Task steps and action attempts run in pools of their own, so
an action goes out while every task runner is busy with a long turn. The task pool runs one more
runner that fires due timers on each poll.

A stop claims nothing new and waits a bounded grace for the work in flight. Work still running at
the deadline is left to recover exactly as after a crash, and a claim that commits after the stop
began never runs: its lease lapses and the next process takes the work back. A claim or a run that
throws a stale-writer error stops the whole pool, because another process writes the database now.

## Crash recovery

Recovery runs before any runner starts, in a process that holds the writer lock under a new writer
epoch. Every lease still held therefore belongs to a process that is gone. Recovery runs five stages
in order:

1. It frees every lease claimed under an older epoch, and records each running task's return to
   ready.
2. It records each step that started without a commit as interrupted.
3. It records each action that started an attempt with no result as unknown, because its call may
   have reached the provider ([actions](./actions.md#attempts)).
4. It fires every timer that fell due while nixie was down.
5. It runs the sandbox cleanup the server passes in, whose job is to destroy every sandbox that
   belongs to a step that no longer runs. The sandboxes projection lists each sandbox that still
   stands with its owner and the adapter that made it
   ([sandboxes](../connectors/sandboxes.md#records-and-recovery)).

The actions module and the sandbox module depend on tasks, and modules form no cycles, so the server
passes stages 3 and 5 in as dependencies. Each stage writes nothing when it runs again over the
state it left, so the next start finishes a recovery that crashed part way through.

## Fault points

Each transition a crash can interrupt has a named fault point, such as the moment after a claim
commits or the moment before a step commit. In a test build, the crash harness installs a handler
that holds the runner at a fault point, then kills the process or releases it
([crash tests](../../design/platform/core/crash-tests.md)). Every fault point sits behind the
test-build flag, so the release bundle holds none of them and no release code path can stop at one.
