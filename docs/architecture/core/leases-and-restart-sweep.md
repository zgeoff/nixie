# Leases and the restart sweep

A runner works on a task step or an action attempt only while it holds that work's lease, and it
proves it still holds the lease inside every transaction that writes. A lease expires unless its
runner renews it, so a runner that dies frees its work within one lease length, and a runner that
was only slow finds its lease gone and commits nothing. Task steps and action attempts claim through
the same path, so both kinds of work follow one set of rules. At each start, the restart sweep runs
before any runner starts and puts every piece of work that a crash left in flight back into a state
a runner can claim. `modules/tasks` owns the claim path, the claim pools and the restart sweep.
[Tasks](./tasks.md) and [actions](./actions.md) cover the work itself.

## The claim path

A claim runs in one write transaction behind the writer epoch check. Inside it, the claim finds the
next piece of work, then takes its lease with one conditional upsert that succeeds only when the
lease is free or expired. A successful claim records the holder, the expiry, the writer epoch and a
generation one higher than the lease's last. SQLite's write lock serializes every claim against
every other write, so two runners never take the same lease. The claim of a task step records the
step's start in the same transaction, so a lease never exists without the step it covers. A claim
that takes back an expired lease on a task with a pause request pauses the task instead, and runs no
step.

A claim refuses the work of a task that the [task gate](pause.md#the-task-gate) holds: while nixie
is paused, every task except one on the exemption list, and every task while the spending stop
stands. A task joins the list when the user resumes it, and Resume nixie empties the list. Each
candidate query applies the gate's predicate in its where clause, so a held task at the head of the
order never hides another task's work. The candidate also names its task, and the claim checks that
task before it takes the lease, with the rule of its caller: an action with a started attempt of a
paused task passes, and a task at a limit is claimed once. So a candidate query that skips the
filter still takes nothing. Under the test build, such a candidate makes the claim throw. A refused
claim writes nothing. Inbox records, fired timers and action outcomes still land on a paused task's
thread, and the claim that follows them is refused until the resume. [Pausing nixie](pause.md) holds
the rest.

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

## Claim pools

A claim pool runs a fixed number of runners over one claim function. An idle runner sleeps for a
poll interval unless the pool wakes it. Task steps and action attempts run in pools of their own, so
an action goes out while every task runner is busy with a long turn. The task pool runs one more
runner that fires due timers on each poll. The tasks that the conversation starts claim their steps
through a claim pool of their own, with 2 claim loops unless `tasks.startedClaimLoops` sets another
number, so the user's next message never waits behind their long steps. The task of a voice call
claims through a third pool, with 1 claim loop unless `tasks.callClaimLoops` sets another number.

A stop claims nothing new and waits a bounded grace for the work in flight. Work still running at
the deadline is left for the restart sweep exactly as after a crash, and a claim that commits after
the stop began never runs: its lease lapses and the next process takes the work back. A claim or a
run that throws a stale-writer error stops the whole pool, because another process writes the
database now.

## The restart sweep

The restart sweep runs at each start, before any runner starts, in a process that holds the writer
lock under a new writer epoch. Every lease still held therefore belongs to a process that is gone.
The sweep runs five stages in order, and the start part `restart_sweep` runs them. After stage `n`,
the fault point `restart_sweep.step.<n>` holds the process in a test build:

1. It frees every lease claimed under an older epoch, and records each running task's return to
   ready, or its pause when the user asked to pause it.
2. It records each step that started without a commit as interrupted.
3. It records each action that started an attempt with no result as unknown, because its call may
   have reached the provider ([actions](./actions.md#attempts)).
4. It fires every timer that fell due while nixie was down.
5. It runs the sandbox cleanup the server passes in, whose job is to destroy every sandbox that
   belongs to a step that no longer runs. It keeps the sandboxes of the conversation, the system
   tasks and every started task that is not done or closed, but it destroys a kept owner's sandbox
   whose image the release's manifest does not hold. The conversation's sandbox is the exception,
   because its own setup replaces it after copying its session out. A destroy that fails is logged
   and tried again at the next start. The sandboxes projection lists each sandbox that still stands
   with its owner and the adapter that made it
   ([sandboxes](../connectors/sandboxes.md#records-and-the-restart-sweep)).

A conversation turn writes each reply to the log before its step commits
([conversation turns](./conversation-turns.md#records-of-a-turn)), so a crash can leave a reply that
no commit keeps. The restart sweep writes nothing for it. The next run of the step, before it spends
or compacts anything, reads the thread back to its last step commit and voids each reply that no
void names, with the reason `attempt_lost`. A runner that lost its lease writes no reply and no
void: the lease check fails inside the write.

The actions module and the sandbox module depend on tasks, and modules form no cycles, so the server
passes stages 3 and 5 in as dependencies. Each stage writes nothing when it runs again over the
state it left, so the next start finishes a restart sweep that crashed part way through.

## Fault points

Each transition a crash can interrupt has a named fault point, such as the moment after a claim
commits or the moment before a step commit. In a test build, the crash harness installs a handler
that holds the runner at a fault point, then kills the process or releases it
([crash tests](./crash-tests.md)). The restore pause has 2: `recovery.pause.committed` after the
pause commits, and `recovery.pause.marker_cleared` after the marker goes
([the start sequence](../deployment/server.md#the-start-sequence)). The trigger core has 2, which
hold a delivery outside its write transaction: `trigger.batch.before` before the transaction opens,
and `trigger.batch.after` after it commits, both with the kind `trigger` and the source's ID. A
claim has `claim.before`, which holds a runner before its claim transaction opens, so a test can
keep a task's runner from claiming the record that a commit has just woken it for.
`turn.reply.after` holds a runner after the transaction that writes a live reply, with the kind
`task` and the task's ID. Every fault point sits behind the test-build flag, so the release bundle
holds none of them and no release code path can stop at one.
