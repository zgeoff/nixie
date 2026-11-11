# Backup and recovery: the restore and the recovery hold

A restored log is up to one backup interval behind the lost host, and only you can check what
happened outside nixie in the lost span. `nixie restore` installs a copy of `nixie.db` and a copy of
`keys.db` that belong together. After it, nixie takes no step of a recovered task and starts no
attempt of a recovered action until you release that task. The recovery hold that stops them is
separate from the task's state. It survives a crash at any point of the restore and of the next
start, and a build that cannot read it refuses to start while one exists.

This doc covers the restore command and the recovery hold together, because the restore's last step
is the first step of the hold. Two docs hold the rest:
[the backup job's publish numbers and the fetch](backup-publish-and-fetch.md) gives the directory
that the restore reads, and [the hold release](recovery-release.md) gives how you release a task,
the API, the restore notice and the runbook.

The section "Built" gives what the code does. Every section after it gives the designed system,
which differs from the code in the restore's steps and the marker's states. The sketches in
`sketches/operations/` hold the shapes, and this doc holds the rules. A place marked
`(open: <name>)` is not settled: see [the open list](open/operations.md), which links the issue.
Each open choice of this doc is yours to make. Other terms are in the [glossary](../../glossary.md).

Terms of this doc:

- A **recovery hold** is a row that stops every claim for one task's steps and actions. This doc
  never writes "held" for a task that a limit paused or for a waiting task with work left.
- A **start part** is a named step of the server's start.
- A **recovery** is one restore or one rollback, under one `recoveryID`. A rollback discards a span
  of the log and is not in scope. This doc always writes "the start part `recovery`" and "the
  command `nixie recovery`" in full for those 2 other things.
- A **hold release** clears one recovery hold. "Release" as a noun alone means a release of nixie.
- The **restore marker** is the file `restore-incomplete` in the data directory.
- The **staging folder** is where nixie stages each backup set for the backup job, one set folder
  for each. The **restore note** is the file `restore-note.json` in it.
- The **reader gate** is the stored value that makes a build without the hold's tables refuse the
  database.
- A **launch** is work that the source of a trigger starts without a task. The designed system has
  none.

## Built

- `restoreDataBackup` takes the writer lock, checks both database copies, copies both into the data
  directory, writes the restore marker, moves both into place and removes the marker. It returns a
  `DataRestore` or a `DataRefusal`.
- `RestoreState` is `'none' | 'replacing'`, with its moves in `restoreMoves`. `startWriter` refuses
  to start while the marker exists.
- `claimLease` is the one function that writes a lease. `ClaimRequest.readCandidate` returns a work
  ID or null. The 2 callers of `claimLease` are `claimTask` and `claimAction`. A claim takes only a
  task that is ready or running.
- The migration runner refuses a database when the stored `oldest_reader` is above the schema
  version that the build writes. It throws `SchemaTooNewError`, at one call. Each migration sets the
  stored `oldest_reader` to the smaller of the schema's value and its own version.
- The start part `recovery` exists, and every runner needs it. It marks as unknown each started
  attempt that has no result, and its last stage destroys the sandboxes of steps that have ended.
- The system tasks are the conversation, the queue check, the note-taker and the consolidator. The
  note-taker's task is `memory-writer`, and the consolidator's is `memory-consolidator`.
- `startBackupSchedule` stages a backup set on a clock, and backups default to on.

## The restore

[The restore](sketches/operations/03-flow.ts), section E, holds the flow.
[`restoreDataBackup`](sketches/operations/02-types.ts), section F, holds its options and result, and
[the files](sketches/operations/02-types.ts), section D, hold the file shapes.

`nixie restore --from <directory> --yes` runs 6 steps (open: restore step order):

| Step | The restore                                                                    | After a kill here, the data directory holds |
| ---- | ------------------------------------------------------------------------------ | ------------------------------------------- |
| 1    | refuses a directory with the unfinished-backup marker, and reads the pair file | what it held before                         |
| 2    | copies both checked copies in, under the writer lock                           | both copies beside the databases, no marker |
| 3    | writes the restore marker in the state `replacing`                             | a marker that reads `replacing`             |
| 4    | moves both databases into place                                                | a marker that reads `replacing`             |
| 5    | removes every set folder of the staging folder and writes the restore note     | a marker that reads `replacing`             |
| 6    | writes the marker's `holding` payload                                          | a marker that reads `holding`               |

- After a kill at any of steps 1 to 5, run the restore again. A second pass of step 5 removes
  nothing more and writes the same note.
- The pair file is `fetched-pair.json`. The fetch writes it, with the IDs of the 2 snapshots it
  fetched and how they relate. When the file does not parse, the restore replaces nothing. A
  directory with no such file is one that `nixie backup --to` wrote, and the restore treats its 2
  copies as one backup set.
- The log module owns step 5. The step takes the backup job's staging lock while the restore holds
  the writer lock. When the restore cannot take the staging lock, it fails at step 5 and the marker
  remains.
- Step 5 removes every set folder, because nixie staged each from the replaced database. The backup
  job would publish a set folder that remained as a backup set of the restored database.
- When a restore ends, the staging folder holds the restore note, whether or not the directory came
  from a fetch. The next publish reads from the note which key snapshot the restore came from. The
  wire lib owns the note's name and schema, because the backup job and nixie both read the note.
- Step 5 comes before step 6, and the server never starts on `replacing`. So when a server starts,
  the staging folder holds no set folder of the replaced database.
- The restore writes nothing into the restored database. The backup's schema can predate the hold's
  tables, and migrations run at the next start.
- `nixie restore` always passes `hold: true` to `restoreDataBackup` (open: holds always). With
  `hold: false`, step 6 removes the marker, and no command passes it.
- `forgottenItems` is an option of `restoreDataBackup`. It selects what the restore does with a
  memory item whose forget came after the data snapshot was written. The restore reads the option
  only for a pair that the fetch marked `older-data`. `nixie restore` has no flag and no config key
  for it (open: forgottenItems value).
- `nixie restore` prints a last line with 2 facts: recovered work waits for a hold release, and
  `nixie recovery` lists that work (open: refusal texts).

## The restore marker

[The marker's states and payload](sketches/operations/02-types.ts), section G, hold the shape.

- The marker has 3 states: `none`, `replacing` and `holding`. The log module owns the marker, its
  states, the moves between them and its payload.
- nixie reads an empty marker, or one that does not parse, as `replacing`.
- The restore writes the payload to a second file and renames that file over the marker. The marker
  file exists at every instant of step 6, so a kill never gives the state `none`.
- `startWriter` takes the option `installsRecoveryHolds`, and only the server sets it. On `holding`,
  `startWriter` starts for the server and refuses every other caller. On `replacing`, it refuses
  every caller.
- The writer carries the payload as `pendingRestore`.

## The tables and the records

[The migration](sketches/operations/02-types.ts), section H, and
[the record kinds](sketches/operations/02-types.ts), section I, hold the shapes.

- One migration, appended to `nixieSchema`, adds the tables `recovery_holds` and `recoveries` and
  one nullable column on `schema_version`. The migration does not raise the schema's `oldestReader`.
- The 3 record kinds are `recovery.started`, `recovery.hold_placed` and `recovery.hold_released`.
  The tasks module owns them. None is an inbox kind, and the tasks projection folds none.
- `recovery_holds` is a projection of 2 of the kinds, with one row for each held subject. A subject
  is a task or a launch source. `recovery.hold_placed` inserts the subject's row, or replaces the
  row. `recovery.hold_released` deletes the row. So a subject has at most one recovery hold.
- `recoveries` has one row for each recovery, from `recovery.started`.
- `recovery.hold_placed` carries `stateAtBackup` and `wasRunning`: the task's state in the restored
  log, and whether a step of the task was running. Only the API's read of a recovery uses them. The
  install of the holds reads both from the task's row before the first stage of the start part
  `recovery` moves a running task.
- `recovery.hold_released` carries `by`: the identity whose session made the hold release, as a
  memory approval carries one.
- nixie stores a recovery hold only as a row of `recovery_holds` (open: hold design). It is never a
  task state, a lease or a far `claimable_at`: a task state stops records from landing, the start
  part `recovery` frees every lease that a previous start of the server wrote, and folds rewrite
  `claimable_at`.
- The fold of `task.closed` never ends a recovery hold. A hold release ends one, and so does a log
  reset, which empties nixie's whole log.

## The reader gate

[The gate functions](sketches/operations/02-types.ts), section J, hold the shape, and
[the gate](sketches/operations/03-flow.ts), section I, holds the flow.

- `closeToOlderReaders` raises the stored `oldest_reader` to the hold migration's version and stores
  the value it replaces in `open_oldest_reader`. `reopenToOlderReaders` puts it back.
- The transaction that writes the first recovery hold closes the gate. The transaction of the hold
  release that clears the last one reopens it.
- A migration that runs while the gate is closed updates `open_oldest_reader` in place of
  `oldest_reader`, and never lowers `oldest_reader`.
- A log reset empties `recovery_holds` with every other table, and does not reopen the gate.
  `syncRecoveryHoldGate` runs at each start and reopens a closed gate when no hold exists.
- The gate is the stored value and never the schema's `oldestReader`. With a raised `oldestReader`
  in the schema, the release before could never read the database again.
- One recovery hold, a hold on a closed task included, stops the release before from starting. So
  clear every recovery hold before you revert nixie to the release before this one.

## The claim check

[The claim check](sketches/operations/02-types.ts), section K, holds the shape, and
[the claim](sketches/operations/03-flow.ts), section G, holds the flow.

- A claim candidate lists every subject whose recovery hold stops it. `claimLease` refuses a
  candidate with a held subject, in the transaction that writes the lease and the step start. A
  refused claim writes nothing.
- The refusal covers every claim: by any runner, for a retry, by the start part `recovery`, by the
  sweep that revives waiting tasks, by task ID, and for an action that started an attempt before the
  backup.
- Each candidate query also filters with `buildRecoveryHoldCheck`, so a held task at the head of the
  order never hides the work behind it. A test build throws when a query returns held work.
- The action query's hold filter has no `attempt_count = 0` condition, so the filter covers an
  action with a started attempt.
- The actions module claims through `claimLease`, so the same check holds an action. The check is
  the only thing the actions module needs from the hold.
- The subject kind `launch_source` exists for a launch, which would claim through `claimLease` with
  its source as the subject. The designed system has no launch, so nixie never writes a hold with
  that subject kind, and a restore never holds a launch source (open: launch sources).
- The tasks module exports `isRecoveryHeld`, which takes the caller's transaction.
  [A read of the hold](sketches/operations/01-usage.ts), section D, shows a call.
  [Fires for a held task](trigger-core.md#fires-for-a-held-task) holds what a fire does with the
  result.
- [Task runs and reports](task-runs-and-reports.md) holds the task run records that the same claim
  writes.
- The hold has no port, by [the rules for any port](port-rules.md): SQLite is the one store.

## Which tasks a restore holds

[Place and install](sketches/operations/02-types.ts), section L, hold the shapes, and
[the next start](sketches/operations/03-flow.ts), section F, holds the flow.

- A restore holds every task that is not done or closed, and every task that owns a pending action,
  less the exempt tasks. A done or closed task that owns a pending action is held, so the action
  cannot retry.
- The exempt tasks are a constant of the server app: `memory-writer` and `memory-consolidator`
  (open: held tasks). The conversation and the queue check are held.
- nixie takes the steps of a task that the restore did not hold. One such task is the task of a
  [task definition](task-definitions.md) that nixie creates after the restore.
- `placeRecoveryHoldsInTransaction` writes nothing for a `recoveryID` that has a `recoveries` row.
  So a repeated install never holds a released task again.
- A placed hold and a hold release change no task state, lease, `resume_state` or `claimable_at`.
- While a task is held, inbox records, fired timers, action outcomes and the records of the start
  part `recovery` land on its thread, and a control works on it as on any task. nixie takes no step
  that reads them until the hold release.
- When a task closes while held, the hold remains until its hold release.
- A rollback calls `placeRecoveryHoldsInTransaction` with the subjects its span touched, in the
  transaction that discards the span. `nixie rollback` is not in scope, so no code makes that call.
  When a hold is placed on a running server, a step that holds a lease runs to its commit.

## The next start

[The next start](sketches/operations/03-flow.ts), section F, holds the flow, and
[the start part and its fault points](sketches/operations/02-types.ts), section M, hold the names.

1. `startWriter` starts for the server on a marker that reads `holding`.
2. The migrations run.
3. The start part `recovery_holds` commits the holds and the closed gate in one transaction, then
   removes the marker.
4. The start part `recovery` runs, and then the runners. It lists the start part `recovery_holds` as
   one it needs, as every runner lists the start part `recovery`.

A fault point is a named place where a test build can stop. What a kill gives at each point:

- Before the restore writes `holding`, the marker reads `replacing`, and every build refuses to
  start. Run the restore again.
- After the restore and through the migrations, the marker reads `holding`. The release before
  refuses on the marker. A build with the hold starts again from step 1.
- Before the holds commit, the start repeats from step 1.
- At the fault point `recovery.holds.committed`, the next start finds the recovery's row, places
  nothing and removes the marker.
- At the fault point `recovery.holds.marker_cleared`, a build with the hold claims nothing held, and
  the release before refuses with `SchemaTooNewError`.

## Not in scope

- A gate on a trigger source, a list of launch sources in the API's read of a recovery, and a hold
  release for a source.
- The holds that a rollback installs for a discarded span, and `nixie rollback`.
- A flag of `nixie restore` that turns the holds off.
- Any config key and any change to a model's prompt.
- A marker that exists until the last hold release. The start part `recovery_holds` removes the
  marker as soon as the holds commit.
- A step at the next start that finishes the forget of each item whose key the key copy lacks (open:
  finish-forgets place).
