# Pausing nixie

The user can pause all of nixie at once. While nixie is paused, no task starts a step and no action
starts an attempt. Messages, notices and action outcomes still land, and each waits until a resume.
The user can resume one task, such as the conversation, while the rest stay paused, and talk to the
assistant while checking the rest. A restore starts nixie paused, with a list of the tasks to check.
Read this before you change a claim, an attempt start, the start after a restore or the reader gate.

```mermaid
flowchart LR
  restore[nixie restore] -->|"holding marker"| part[start part restore_pause]
  part -->|"pause, tasks to check"| log[event log]
  user[user] -->|"pause, resume, resume one task"| log
  log --> pause[(nixie_pause, pause_exemptions)]
  log -->|"close while paused"| gate[reader gate]
  pause -->|"hold a task"| claim[task gate]
```

## The pause and its records

nixie is paused exactly while the one-row table `nixie_pause` holds its row, with a cause of
`restore`, `owner` or `spending`. A `restore` pause carries the recovery ID of its restore, and no
other cause carries one. `pause_exemptions` lists the tasks that run while nixie is paused, and
`recoveries` holds one row per restore. All 3 tables are projections of 4 record kinds, so a
projection rebuild gives the same rows:

| Record                | Does                                                                        |
| --------------------- | --------------------------------------------------------------------------- |
| `nixie.paused`        | sets the `nixie_pause` row, with the cause and `by`, and empties exemptions |
| `nixie.resumed`       | deletes the `nixie_pause` row and every exemption                           |
| `nixie.task_exempted` | adds one task to `pause_exemptions`                                         |
| `recovery.started`    | adds the `recoveries` row, with the restore's times and the tasks to check  |

The 4 kinds go on no thread, so the record stream never carries them and a thread reader of an
earlier release never meets them. The [API](../channels/api.md#pausing-nixie) gives the client a
signed-in read of the pause state for that reason.

- nixie stores the pause only in `nixie_pause`, never as a task state, a lease or a far
  `claimable_at`. A pause, a resume and an exemption change none of them. A task the user paused
  stays paused after nixie resumes, and a task's own resume never resumes nixie.
- A pause while nixie is paused replaces the cause and clears every exemption, except a `spending`
  pause, which never replaces another cause. A resume while nixie is not paused writes nothing.
- An exemption needs nixie to be paused, and a second one for the same task writes nothing new.
- The user pauses or resumes nixie, or resumes one task, through the API, a host command or the web
  client. No tool does any of these. nixie pauses itself in 2 cases:
  - the [hard spending stop](../policy/spending-stop.md) pauses with the cause `spending` and a `by`
    of null, and resumes only that pause;
  - the start after a restore pauses with the cause `restore`, as
    [the pause after a restore](#the-pause-after-a-restore) describes.
- The pause lives in the log module, which the tasks module, the trigger core and the backup
  schedule each import already. `readPause` returns the cause and the recovery ID, or null.

## What a pause stops

Every task is paused while nixie is paused, except a task in `pause_exemptions`. A task created
while nixie is paused is paused too, such as a task that an exempt task starts. Records still land
on each task's thread, and every task control works. nixie takes no step that reads them until the
resume, or until the user resumes that task, which then takes its inbox as it stands.

- `claimLease` refuses a candidate whose task nixie's pause holds, in the transaction that would
  write the lease. The refusal covers every claim: by any runner, for a retry, by the start part
  `restart_sweep`, and for an action that started an attempt before a backup. A refused claim writes
  nothing.
- Each candidate query filters with the predicate of the [task gate](#the-task-gate), so a paused
  task at the head of the order never hides an exempt task's work behind it. Under
  `NIXIE_TEST_BUILD`, `claimLease` throws when a candidate query returns held work.
- The attempt start reads the task's holds in the transaction that writes the attempt record, so a
  pause between a claim and its attempt starts no attempt. The action stays pending until a resume,
  and its lease is freed.
- When nixie pauses on a running server, a step that holds a lease runs to its commit, and a started
  attempt runs to its outcome. Nothing new starts after either.
- While nixie is paused, each task reads as paused in the client, and its resume exempts it, as
  [pause, stop and close](tasks.md#pause-stop-and-close) describes.

A schedule fire waits while nixie is paused: the trigger core writes nothing for it and takes no
key, so the schedule source delivers it again at its next tick. After the resume, or after the user
resumes the task, the fire is late, and the catch-up rule of
[the schedule source](triggers.md#the-schedule-source) decides. A fire at the conversation waits
too, though a conversation the user paused still takes its fires.

## The task gate

`readTaskGate` in the tasks module answers whether a task may go on, in the caller's transaction. It
gives `open`, or a hold with the first reason that applies, in this order, and `since`, the time of
the record that put the task in that hold:

| Reason  | The task is held because                                                                                                          |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ended` | it is done, stopped, failed or closed                                                                                             |
| `spend` | the [spending stop](../policy/spending-stop.md) stands, or the task is held on a route whose stop stands, whatever the exemptions |
| `nixie` | nixie is paused and the task is not on the exemption list                                                                         |
| `limit` | the newest limit record on its thread is `task.limit_reached`                                                                     |
| `task`  | its state is `paused`; a pause request counts once `task.paused` is written                                                       |

The spending stop's row, and each route's stop and the tasks held on it, live in the log module,
beside the pause tables, so the tasks module reads them without importing the spend module. A trip
of the turn count still pauses nixie, and the gate reports `spend` first. A route's stop pauses
nothing: it holds only the tasks on that route, and the gate reports `spend` for them. Each caller
applies its own rule to the reasons:

| Caller         | `ended`                            | `spend`, `nixie`               | `limit`, `task`                                    |
| -------------- | ---------------------------------- | ------------------------------ | -------------------------------------------------- |
| task claim     | skips the task                     | skips the task                 | skips a paused task; claims a task at a limit once |
| action claim   | by the task's state, as in actions | skips every action             | skips an action with no started attempt            |
| action attempt | by the task's state, as in actions | barred, and its lease is freed | barred when no attempt has started                 |
| schedule fire  | `trigger.skipped` with `task_held` | writes nothing, takes no key   | `trigger.skipped` with `task_held`                 |
| step start     | the claim skipped the task         | `spend` ends the step at once  | at a limit, writes `task.paused` and ends          |

- Every claim query, and the attempt start, read each reason on its own, so an ended task's action
  is still held while nixie is paused. A conversation target of a schedule heeds only `nixie` and
  `spend`.
- The claim filter and the gate build from the same SQL check for each reason, and a test per caller
  checks that they agree.
- A step under way when nixie pauses runs to its commit. A step that finds the spending stop at its
  start ends before its turn and writes no record.

## The reader gate

Every pause closes the database to a release that does not know the pause, so that release never
runs the tasks the pause holds. The gate is the stored `oldest_reader` value, never the schema's
`oldestReader`: a raised schema value would stop the earlier release from reading the database
again, paused or not.

- The transaction that pauses nixie calls `closeToOlderReaders`, which saves the stored value in
  `open_oldest_reader` and raises `oldest_reader` to `pauseMigrationVersion`. The resume calls
  `reopenToOlderReaders` in its own transaction.
- A migration that runs while the gate is closed writes the value it would give `oldest_reader` to
  `open_oldest_reader`, and never lowers `oldest_reader`.
- `syncPauseGate` runs at each start, after the migrations. It reopens a closed gate when nixie is
  not paused, and closes an open one when it is, such as after a projection rebuild.
- While nixie is paused, a release without the pause refuses to start with `SchemaTooNewError`.

## The pause after a restore

The restore ends by writing its marker in the state `holding`, with the recovery ID, the restore's
time and the time of the newest record in the backup. Its steps are in
[backup and restore](../deployment/host-commands.md#backup-and-restore). The restore writes nothing
into the restored database, because the backup's schema can predate the pause tables and the
migrations run only at a start. So the next start pauses nixie:

1. `startWriter` starts for the server on `holding`, and the migrations run.
2. The start part `restore_pause` runs after `first_seed`, so the first seed's tasks are paused with
   the rest. `installRestorePause` writes `recovery.started`, then `nixie.paused` with the cause
   `restore`, then a `recovery.notice` on the conversation's thread, in one transaction. It then
   removes the marker.
3. The start part `restart_sweep` runs, then the runners.

The tasks to check, `toCheck` in `recovery.started`, are every task that was running at the backup,
and every task that owns an action with no outcome, the conversation included. A done, stopped or
closed task can own one, because a started attempt runs on to its outcome. The install reads each
task's row before the start part `restart_sweep` moves a running task, so the list shows each task
as the backup held it. When a `recoveries` row exists for the recovery ID, the install writes
nothing, so a repeated install never pauses nixie again after the user resumed.

| A kill lands                              | The next start                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| before the restore writes `holding`       | every build refuses on `replacing`; the user runs the restore again     |
| after the restore, through the migrations | an earlier release refuses on the marker; this one starts again         |
| before the pause commits                  | starts again from step 1                                                |
| at `recovery.pause.committed`             | finds the `recoveries` row, writes nothing, and removes the marker      |
| at `recovery.pause.marker_cleared`        | claims nothing paused; an earlier release refuses with the gate's error |

Every restore starts nixie paused, and `nixie restore` has no flag that skips it. After a restore,
the web client lists the tasks to check beside the resume control while the pause's cause is
`restore`. Each resume acts at once, with no confirm step.
