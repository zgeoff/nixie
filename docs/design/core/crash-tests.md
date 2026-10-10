# Crash tests

- Decisions: [0001](../../decisions/0001-durable-layer.md),
  [0021](../../decisions/0021-action-outcomes.md),
  [0025](../../decisions/0025-database-and-topology.md)

nixie owns its durable layer under [0001](../../decisions/0001-durable-layer.md), so its own tests
prove that a crash at any point loses nothing and repeats nothing. Each test runs nixie as a child
process, stops it at a named fault point, kills it, restarts it on the same database, and checks the
event log and the projections. 5 tests gate slice 1: lease expiry, a timer due while nixie was down,
a retry, a wake-up and a crash mid-turn. A test-only connector shows in each of them that a resumed
task run never repeats an action that ran.

## What a crash is

A crash is a `SIGKILL` of the nixie process: no handler runs, and every transaction that has not
committed rolls back. Other failures reduce to it or belong to a later slice:

- **A host reboot or a pod eviction** kills nixie the same way and also loses every sandbox. Slice 1
  tests the kill. Slice 2 tests sandbox cleanup, where workers first exist.
- **A graceful stop** on `SIGTERM` stops claiming steps and gives steps in flight 30 s to commit,
  under [upgrades](../deployment/upgrades.md). A step still running at the deadline recovers as
  after a crash.
- **A rollout** must stop the old pod before the new pod opens the database. Slice 1's live check on
  Kubernetes owns that test.
- **An impd restart or a dead sandbox** fails the tool call that used it. The step reruns, and the
  action queue keeps the rerun from repeating an action.

The tests never kill SQLite mid-transaction to test SQLite. They kill nixie between its own
transactions and check that each commit group in the [tasks](./tasks.md) and [actions](./actions.md)
designs applied whole or not at all.

## The harness

The harness drives nixie through 4 hooks, which the code exposes only under a test build flag.

1. **Fault points.** Each transition in the core has a stable fault point ID. When a test names a
   point, nixie pauses there and reports that it arrived, and the test then sends `SIGKILL`. A test
   that wants the kill after the transaction names the point after the commit.
2. **The scripted turn.** The runner's turn step sits behind an interface that the test replaces
   with a script, such as "call `test.send` with these arguments, then end the turn". The script
   makes the same calls when the step reruns, as a model replaying an uncommitted turn would. No
   test calls a model.
3. **The clock.** Leases, timers, lapses and retry delays all read one clock, which the test sets
   and advances. A test never sleeps to let time pass.
4. **The test connector.** It declares one action, `test.send`, and calls an in-process provider
   double that records every call with its idempotency key. The test sets each response: success, a
   refusal that can clear, a refusal with no effect, or a dropped connection.

The SDK half of a crash mid-turn needs a real session: the rerun forks at the session boundary and
drops the uncommitted turn. Slice 1's session tests, ported from the
[resume-at spike](../../../spikes/sdk-resume-at/README.md), cover that half, so these tests replace
the turn with the scripted turn.

## The oracle

Every test ends with the same checks:

- Each step key has at most one commit, and each action ID has at most one queue entry.
- The provider double recorded each call that the test allows, and no other.
- Dropping every projection and folding the log rebuilds tables equal to the live ones, using slice
  1's rebuild test.
- No task holds a lease after recovery, and every task with unread input is `ready`.

## Fault points

These are the transitions the tests stop at. Each ID belongs to the code, and the list grows with
each slice.

| Fault point              | Transition it interrupts                              |
| ------------------------ | ----------------------------------------------------- |
| `claim.after`            | A runner holds a new lease                            |
| `renew.before`           | A lease renewal is due                                |
| `step.commit.before`     | A step's result, records, state and cursor            |
| `step.commit.after`      | The same, committed                                   |
| `proposal.commit.after`  | A proposal in its own transaction                     |
| `queue.commit.before`    | An approval consumed and its action queued            |
| `queue.commit.after`     | The same, committed                                   |
| `attempt.record.after`   | An attempt record, before the provider call           |
| `attempt.result.before`  | A provider response, before its result commits        |
| `timer.fire.before`      | A due timer, before its record and inbox entry commit |
| `inbox.write.after`      | A message or event in a task's inbox                  |
| `trigger.deliver.before` | A trigger batch, its cursor and its wake-ups          |
| `recovery.step.<n>`      | Each of the 5 recovery steps in [tasks](./tasks.md)   |
| `sigterm.grace`          | A step in flight during the graceful stop             |

## Slice 1 tests

### Lease expiry

Runner A claims a task and stops at `claim.after`. The test suspends A with `SIGSTOP`, advances the
clock past the 60 s lease, and lets runner B claim. Then it resumes A and lets it try to commit.

- B holds generation n + 1, and A's commit returns no rows.
- The task has exactly one commit for the step.
- In the kill variant, the test kills A instead. The restart expires A's lease, and the task runs
  once.

### A timer due while nixie was down

A task waits on a durable timer due at T. The test kills nixie before T, advances the clock past T,
and restarts. A second run kills nixie at `timer.fire.before` on the restart.

- The timer fires exactly once, with one record that holds the due time and the fire time.
- The record reaches the task's inbox, and the task becomes `ready`.
- A kill at `timer.fire.before` leaves the timer unfired, and the next restart fires it once.

### A retry

The test connector refuses `test.send` with a refusal that can clear. The test kills nixie after the
result commits, restarts, and advances the clock through the retry schedule in
[actions](./actions.md).

- The attempt count continues across the restart, and each delay matches the schedule.
- The next attempt time survives the restart, so the action stores it in its own row.
- A refusal on the fifth attempt makes the action `failed`, and the reason reaches the inbox.
- A kill at `attempt.record.after` makes the action unknown on restart, never a plain second
  attempt.

### A wake-up

A task waits with no unread input. Each source of a wake-up writes to its inbox: your message, a
fired timer, an action outcome and a trigger event. For each source, the test kills nixie at
`inbox.write.after` and again at `trigger.deliver.before`, then restarts.

- A committed inbox entry makes the task `ready` after restart, and its next step reads it once.
- A trigger batch killed before its commit arrives again from the stored cursor, and its dedupe key
  keeps it to one event.
- An event that arrives before a step registers its wait still reaches the task.

### A crash mid-turn

The scripted turn calls `test.send`, which a rule allows, and the step then commits. The test kills
nixie at each of `queue.commit.after`, `attempt.record.after`, `attempt.result.before` and
`step.commit.before`, restarts, and lets the step rerun with the same script.

- The rerun's call matches by action hash and returns the existing action's status, under
  [tasks](./tasks.md#crash-recovery).
- The provider double records at most one call without an idempotency key.
- A kill after the attempt record and before the result leaves the action unknown, and
  reconciliation follows the connector's declaration.
- A proposal variant stops at `proposal.commit.after`: the rerun returns the same proposal, and one
  approval queues one action.

## Reconciliation

The test connector runs once under each reconciliation declaration in [actions](./actions.md). Each
run kills nixie at `attempt.record.after` so that the action becomes unknown.

- **Idempotency key:** the retry reaches the provider double with the same key, and nixie never
  creates a second key for the action.
- **Check:** found makes the action done, and not found returns it to pending. Inconclusive brings
  it to you, and so do 3 unknown outcomes in a row.
- **Neither:** the action comes to you in the approval digest, and the provider double records no
  second call.

## The graceful stop

The test sends `SIGTERM` while a scripted turn runs. A step that finishes inside the grace window
commits once. A step still running at the deadline stops with the process and recovers as after a
crash. nixie claims no new step after the signal.

## The tests by slice

| Test                                  | Fault point             | Runs in | Slice |
| ------------------------------------- | ----------------------- | ------- | ----- |
| Lease expiry                          | `claim.after`           | CI      | 1     |
| A timer due while nixie was down      | `timer.fire.before`     | CI      | 1     |
| A retry                               | `attempt.result.before` | CI      | 1     |
| A wake-up                             | `inbox.write.after`     | CI      | 1     |
| A crash mid-turn                      | `step.commit.before`    | CI      | 1     |
| Reconciliation per declaration        | `attempt.record.after`  | CI      | 1     |
| The graceful stop                     | `sigterm.grace`         | CI      | 1     |
| The rollout keeps one writer          | none                    | live    | 1     |
| Sandbox cleanup after a crash         | `recovery.step.5`       | CI      | 2     |
| Pause, stop and restart at each state | `step.commit.before`    | CI      | 2     |
| A misroute moved across a crash       | `step.commit.before`    | CI      | 2     |
| A recovery hold through restart       | `recovery.step.1`       | CI      | 5     |
| A job run's catch-up after downtime   | `timer.fire.before`     | CI      | 7     |
| A random kill soak                    | any                     | CI      | 2     |

The random kill soak repeats the [event log spike](../../../spikes/event-log-db/README.md): many
runners, kills at random times, and the same oracle. It finds faults the named points miss, and it
never gates a slice on its own.
