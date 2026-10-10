# Crash tests

- Decisions: [0001](../../../decisions/0001-durable-layer.md),
  [0021](../../../decisions/0021-action-outcomes.md),
  [0025](../../../decisions/0025-database-and-topology.md)

nixie owns its durable layer under [0001](../../../decisions/0001-durable-layer.md), so its own
tests prove that a crash at any point loses nothing and repeats nothing. Each test runs nixie as a
child process, stops it at a named fault point, kills it, restarts it on the same database, and
checks the event log and the projections. 5 tests gate slice 1: lease expiry, a timer due while
nixie was down, a retry, a wake-up and a crash mid-turn. Tests of the graceful stop and the single
writer run beside them. A test-only connector shows in each of them that a resumed task run never
repeats an action that ran.

## What a crash is

A crash is a `SIGKILL` of the nixie process: no handler runs, and every transaction that has not
committed rolls back. Other failures reduce to it or belong to a later slice:

- **A host reboot or a pod eviction** kills nixie the same way and also loses every sandbox. Slice 1
  tests the kill. Slice 2 tests sandbox cleanup, where workers first exist.
- **A graceful stop** on `SIGTERM` stops claiming steps and gives steps in flight 30 s to commit,
  under [upgrades](../deployment/upgrades.md). A step still running at the deadline recovers as
  after a crash.
- **A rollout or a second process** meets the
  [writer lock](../../../architecture/database.md#the-single-writer). The second writer and stale
  writer epoch tests below prove the lock and the epoch check in CI, and slice 1's live check on
  Kubernetes confirms a rollout.
- **An impd restart or a dead sandbox** fails the tool call that used it. The step reruns, and the
  action queue keeps the rerun from repeating an action.

The tests never kill SQLite mid-transaction to test SQLite. They kill nixie between its own
transactions and check that each commit group in the [tasks](tasks.md) and [actions](actions.md)
designs applied whole or not at all.

## The harness

The harness drives nixie through 5 hooks, and every hook exists only in a
[test build](../code-layout.md#test-builds). The scripted model and the provider double run in the
test process, outside the nixie process that a test kills, so their records survive every kill.

1. **Fault points.** Each transition in the core has a stable fault point ID. When a test names a
   point, the runner that reaches it pauses there and reports that it arrived. Other runners carry
   on. The test then sends `SIGKILL` to the nixie process, or releases the runner. A test that wants
   the kill after a transaction names the point after its commit.
2. **The scripted model.** The test points the model profile at a local mock of the Messages API, as
   the [tools endpoint spike](../spikes/tools-endpoint/README.md) does. The mock answers each
   request from a script, such as "call `test.send` with these arguments, then end the turn", and
   records every request it receives. The real SDK resumes and forks the session, so a test covers
   both the core and the SDK half of a rerun. No test calls a real model.
3. **The sandbox double.** nixie runs every sandbox through `adapters/sandbox-process`, which starts
   each guest as a local child process with no isolation. The conversation guest runs the real SDK
   against the scripted model and reaches nixie's tool endpoint over a local route. **Why:** CI then
   needs no `/dev/kvm` and no impd. The live checks on Kubernetes and Compose cover imp itself.
4. **The clock.** Leases, timers, lapses and retry delays all read one clock, which the test sets
   and advances. A test never sleeps to let time pass.
5. **The test connector.** It declares one action, `test.send`, and calls a provider double that
   records every call with its idempotency key. The test rule allows `test.send`, as
   [the slice 1 rule](../policy/decision-point.md#the-slice-1-rule) describes. The test sets each
   response: success, a refusal that can clear, a refusal with no effect, or a dropped connection.
   From slice 3, the double also answers the connector's check with found, not found or
   inconclusive.

## The oracle

Every test ends with the same checks:

- Each step key has at most one commit, and each action ID has at most one queue entry.
- The provider double recorded each call that the test allows, and no other.
- Dropping every projection and folding the log rebuilds tables equal to the live ones, using slice
  1's rebuild test.
- No task holds a lease after recovery. A task in `stopped`, `failed`, `done` or `closed` keeps its
  state, and a running or waiting task with unread input and no pause or recovery hold is `ready`.

## Fault points

These are the transitions the tests stop at. Each ID belongs to the code, and the list grows with
each slice.

| Fault point              | Transition it interrupts                               |
| ------------------------ | ------------------------------------------------------ |
| `claim.after`            | A runner holds a new lease                             |
| `renew.before`           | A lease renewal is due                                 |
| `renew.after`            | A lease renewal committed                              |
| `step.commit.before`     | A step's result, records, state and cursor             |
| `step.commit.after`      | The same, committed                                    |
| `queue.commit.before`    | An allowed call's action queued                        |
| `queue.commit.after`     | The same, committed                                    |
| `attempt.record.after`   | An attempt record, before the provider call            |
| `attempt.result.before`  | A provider response, before its result commits         |
| `attempt.result.after`   | The result and outcome, committed                      |
| `timer.fire.before`      | A due timer, before its record and inbox entry commit  |
| `inbox.write.after`      | A message or event in a task's inbox                   |
| `trigger.deliver.before` | A trigger batch, its cursor and its wake-ups           |
| `control.commit.before`  | A pause, stop, restart or close record and its effects |
| `proposal.commit.after`  | A proposal in its own transaction                      |
| `consume.commit.before`  | An approval consumed and its action queued             |
| `policy.recheck.after`   | A queued action failed or returned to a proposal       |
| `defer.commit.after`     | A defer with its new return time and defer generation  |
| `recovery.step.<n>`      | Each of the 5 recovery steps in [tasks](tasks.md)      |
| `sigterm.grace`          | A step in flight during the graceful stop              |

## Slice 1 tests

### Lease expiry

Runners A and B share one nixie process. A claims a task and pauses at `claim.after`. The test
advances the clock past the 60 s lease and lets B claim, then releases A to try its commit.

- B holds generation n + 1, and A's commit returns no rows.
- The task has exactly one commit for the step.
- A variant pauses A at `renew.after`, then advances the clock past the renewed expiry. B claims
  only after that expiry, never before it.
- In the kill variant, the test kills nixie at `claim.after`. The restart expires the dead process's
  lease, and the task runs once.

### A timer due while nixie was down

A task waits on a durable timer due at T. The test kills nixie before T, advances the clock past T,
and restarts. A second run kills nixie at `timer.fire.before` on the restart.

- The timer fires exactly once, with one record that holds the due time and the fire time.
- The record reaches the task's inbox, and the task becomes `ready`.
- A kill at `timer.fire.before` leaves the timer unfired, and the next restart fires it once.

### A retry

The test connector refuses `test.send` with a refusal that can clear. The test kills nixie at
`attempt.result.after`, restarts, and advances the clock through the retry schedule in
[actions](actions.md).

- The attempt count continues across the restart, and each delay matches the schedule.
- The next attempt time survives the restart, so the action stores it in its own row.
- A refusal on the fifth attempt makes the action `failed`, and the reason reaches the inbox.
- A kill at `attempt.record.after` makes the action unknown on restart, never a plain second
  attempt.

### A wake-up

A task waits with no unread input. Each source of a wake-up writes to its inbox: your message, a
fired timer, an action outcome and a trigger event. For each source, the test kills nixie at
`inbox.write.after`, then restarts. For a trigger event, it also kills nixie at
`trigger.deliver.before`.

- A committed inbox entry makes the task `ready` after restart, and its next step reads it once.
- A trigger batch killed before its commit arrives again from the stored cursor, and its dedupe key
  keeps it to one event.
- An event that arrives before a step registers its wait still reaches the task.

### A crash mid-turn

The scripted model calls `test.send`, which the test rule allows, and the step then commits. The
test kills nixie at each of `queue.commit.after`, `attempt.record.after`, `attempt.result.before`
and `step.commit.before`, restarts, and lets the step rerun with the same script.

- The rerun's call matches by action hash and returns the existing action's status, under
  [tasks](tasks.md#crash-recovery).
- The provider double records at most one call without an idempotency key.
- A kill after the attempt record and before the result leaves the action unknown, and the provider
  double records no second call.
- The mock's first request on the rerun holds the committed turns and none of the interrupted turn,
  because the rerun forks at the session boundary.

### The graceful stop

The test sends `SIGTERM` while a scripted turn runs. A step that finishes inside the grace window
commits once. A step still running at the deadline stops with the process and recovers as after a
crash. nixie claims no new step after the signal.

### A second writer

The test starts process A, then starts process B on the same data directory. A second variant
freezes A with `SIGSTOP` before B starts, and a third runs the restore command in place of B.

- B exits non-zero with `writer lock held by another process`, and writes nothing.
- The restore command refuses to replace the database while A holds the lock.
- A's writer epoch is unchanged, and A carries on, or resumes after `SIGCONT`.
- After the test kills A, B starts, raises the epoch, and runs recovery.

### A stale writer epoch

The test starts process A with a test-only hook that closes A's lock descriptor without stopping A,
as a bug would. It then starts process B, which takes the lock and raises the epoch, and lets A
commit a step.

- A's first write fails on the epoch, and A exits.
- A write that A started before B's raise commits before it, and nothing from A commits after it.
- B expires A's leases, because A claimed them under an older epoch.

## Later slice tests

Each later slice adds its crash tests in this doc before it starts, on the same harness and oracle:

- **Slice 2:** sandbox cleanup after a crash, pause, stop, restart and close at
  `control.commit.before` and at each task state, and a misroute moved across a crash.
- **Slice 3:** a proposal at `proposal.commit.after`, consumption at `consume.commit.before`, a
  lapse at `timer.fire.before`, a defer at `defer.commit.after` with a stale return suppressed, a
  policy change at `policy.recheck.after`, and reconciliation under each connector declaration.
- **Slice 5:** a recovery hold through a restart.
- **Slice 7:** a job run's catch-up after downtime.

## Slice 1 summary

| Test                             | Fault points                                      | Runs in |
| -------------------------------- | ------------------------------------------------- | ------- |
| Lease expiry                     | `claim.after`, `renew.after`                      | CI      |
| A timer due while nixie was down | `timer.fire.before`                               | CI      |
| A retry                          | `attempt.result.after`, `attempt.record.after`    | CI      |
| A wake-up                        | `inbox.write.after`, `trigger.deliver.before`     | CI      |
| A crash mid-turn                 | `queue.commit.after` through `step.commit.before` | CI      |
| The graceful stop                | `sigterm.grace`                                   | CI      |
| A second writer                  | none                                              | CI      |
| A stale writer epoch             | none                                              | CI      |
| The rollout keeps one writer     | none                                              | live    |

A random kill soak repeats the [event log spike](../spikes/event-log-db/README.md) from slice 2:
many runners, kills at random times, and the same oracle. It finds faults the named points miss, and
it never gates a slice on its own.
