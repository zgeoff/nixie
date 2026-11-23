# One gate for every hold on a task

- **Status:** draft

A task can be held for four reasons: you paused it, you paused all of nixie, the spending stop
tripped, or the task reached one of its limits. Today each check reads its own subset. The claim
filter reads the task's state and the nixie pause, the attempt check reads another list of states,
the spending stop runs a check of its own before each turn, and a schedule reads only the task's own
pause and limit. So a schedule fires into a task's inbox while all of nixie is paused, which the
[pause design](pause.md) says never happens. After this design, one function answers whether a task
may go on and why not, and every claim, action attempt, turn and trigger fire asks it.

The same cleanup settles a word. "Recovery" means two things today, the restart sweep after a crash
and one restore. After this design it means one.

Once the owner approves this design, build its work items from it and the built
[claim path](../../architecture/core/leases-and-recovery.md#the-claim-path) it extends.

## Shape

```mermaid
flowchart LR
  claim[task claim] --> gate{readTaskGate}
  attempt[action attempt] --> gate
  fire[trigger fire] --> gate
  turn[turn start] --> gate
  gate -->|"open"| go[go on]
  gate -->|"held: ended, task or limit"| skip[skip; a fire writes a record]
  gate -->|"held: nixie or spend"| wait[wait; a fire comes again]
```

## Terms

- A task is **held** when the gate answers anything but open. Every other word for it, such as
  paused, barred or stopped, names a reason.
- An **exempt task** is one you resumed while nixie is paused, as in the [pause design](pause.md).

## Contracts

### The gate

```ts
const gate = await readTaskGate(tx, taskID);
// → { open: false, reason: 'nixie', since: 1796548800000 }
```

```ts
// tasks module. The one answer to "may this task go on", read inside the caller's transaction.
// since: the recorded time, in epoch ms, of the record that started the hold, such as
// task.stopped, spend.stop_tripped, nixie.paused, task.paused or task.limit_reached. The task
// list shows it as "paused since".
type TaskGate = { open: true } | { open: false; reason: TaskHoldReason; since: number };

// In order of precedence: the first that holds is the reason. An ended task comes first, because
// it never runs again, so a caller never waits on it.
type TaskHoldReason =
  | 'ended' // the task is stopped, failed or closed
  | 'spend' // the spending stop's row stands; an exemption doesn't lift it
  | 'nixie' // nixie is paused, by you or by a restore, and the task isn't exempt
  | 'task' // the task is paused; a pause you asked for counts once task.paused is written
  | 'limit'; // the task reached a limit and nothing raised it
```

- The log module owns the spending stop's row, beside the pause tables, so the tasks module reads it
  with no cycle. The spend module writes the row through the log module, as it writes the pause
  today.
- The spending stop holds a task through its own row, whatever the nixie pause's cause. A trip still
  pauses nixie, and nixie can't resume while the stop stands, as today.
- The claim filter keeps its SQL form and builds it from the same predicate the gate uses. A test
  runs the gate and the filter over every reason and checks they agree.
- The claim filter leaves out `limit`. A task at a limit is claimed once, and the step start writes
  `task.paused`, as today; from then on its reason is `task`.
- `readTaskGate` replaces `probeTaskPaused`, the attempt check's list of states and the definition
  fire's held check.

### What each caller does when held

| Caller         | `ended`                            | `task` or `limit`                                        | `nixie` or `spend`                                       |
| -------------- | ---------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| task claim     | skips the task                     | skips the task                                           | skips the task                                           |
| action attempt | cancelled, as today                | barred, stays pending; a started attempt runs to its end | barred, stays pending, and the lease is freed            |
| schedule fire  | `trigger.skipped` with `task_held` | `trigger.skipped` with `task_held`, as today             | writes nothing and claims no trigger key; it comes again |
| turn start     | the claim already skipped it       | the claim already skipped it                             | the step ends at once, with no error and no record       |

- An unstarted action of a task at a limit waits until the limit is raised.
- A schedule fire that nixie holds claims no trigger key, the key that stops a fire landing twice,
  so the source's next tick delivers it again. When the hold ends, the fire is late, and the
  [catch-up rule](../../architecture/core/triggers.md#the-schedule-source) decides it, as for a fire
  missed while nixie was down: one catch-up within half the interval, otherwise a `too_late` skip.
- A one-shot schedule that waits is not retired. It retires when it fires or is skipped.
- Poll sources, such as mail, never read the gate. They keep their cursor, and their events land in
  the inbox while nixie is paused, and wait there.
- A trigger whose target is the conversation reads the gate of the conversation's task, like any
  other target.
- A step already under way when its task is paused finishes, as a pause request does today.
- Timers, inbox records and action outcomes land while a task is held, as they do today.

### The turn start

The claim filter already holds a task that is held when its step starts. The turn start covers a
spending stop that trips during a step.

- Before each model call, the step trips the stop if the turn count reached its limit, then reads
  the gate in a read transaction. It covers conversation steps, task steps and worker runs; a worker
  run reads the gate of the task that started it.
- A held turn ends the step at once. The claim filter holds the next claim. The two-second wait of
  today's spending check goes.

### The two recoveries

The rename shares no code with the gate and ships as its own work item.

| Name             | Crash side, after the rename | Restore side, unchanged                                                    |
| ---------------- | ---------------------------- | -------------------------------------------------------------------------- |
| the thing        | the restart sweep            | recovery: one restore under one `recoveryID`                               |
| start part       | `restart_sweep`              | –                                                                          |
| entry point      | `runRestartSweep`            | `installRestorePause`                                                      |
| stored or public | –                            | `recoveries` table, `recovery.started`, `recovery.notice`, `recovery.read` |
| fault points     | `restart_sweep.*`            | `recovery.pause.*`                                                         |

The restore side keeps the word, because its names are stored and published. The crash side holds
only code names and fault point IDs.

## Constraints

- Every claim, attempt start and trigger fire reads `readTaskGate` in the same transaction as the
  write it guards. A turn start writes nothing and reads it in a read transaction of its own.
- A hold never drops a fire. A fire lands, waits for the next delivery, or is skipped with a record
  that gives the reason.
- The gate reads only the database.
- The lease guard keeps its test-build throw for a candidate the claim should have filtered out, so
  a claim query that skips the filter fails in tests. It applies each caller's rule from the table:
  a started attempt of a task held for `task` or `limit` passes.

## Builder decides

- How the claim filter and the gate share the predicate.
- The fault point IDs' new prefix, once the old IDs are gone.

## Out of scope

- What a resume does, and which tasks can be exempt. The [pause design](pause.md) holds them.
- The spending stop's limits and its watcher.

## Open questions

- **Where the spending stop's row lives.** The gate needs it, and the tasks module can't import the
  spend module without a cycle. Moving the row to the log module, beside the pause tables, keeps the
  gate one read. The other choice is a reader that the server passes in. Until the owner decides,
  the row moves.

- **Which side gives up "recovery".** The owner chose to rename the restore side. Its names are
  stored and published, so that rename needs a migration, new record kinds with the old ones still
  read, and a new API route beside the old one for a minor release. Renaming the crash side touches
  code and fault point IDs only. The design shows the crash-side rename. Until the owner decides,
  the rename's work item waits, and the gate ships without it.
