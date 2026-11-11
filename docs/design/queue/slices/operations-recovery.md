# Slices: backup and recovery

Slices 9 to 20 of the operations design: the work of
[the backup and recovery issue](https://linear.app/zgeoff/issue/GEO-1816), in dependency order.
Slices 1 to 8 are in [the slices](operations.md). Every slice here is milestone 4. Each one waits
for the Not decided items of [the open list](../open/operations.md), which you settle just before
the build, and the order of the slices is a first draft (open: operations slice order). Every test
command is a lane of [the evidence lanes](../evidence-lanes.md). Each Rollback line is a statement
for one release back (open: one release back).

Slices 9 to 11 need no recovery hold and can be built beside the seed slices. Their tests seed
stored state through `ctx.seed` from their first commit.

Each slice has the ID `operations-<n>`, which is unique across the queue, and each "Needs" names a
slice by its ID. In any other field of this file, "slice n" means `operations-n`.
[The work list](../work-list.md) gives the build order.

### operations-9. The publish numbers

- **Outcome:** `publishBackupSet` writes the key snapshot first and tags both snapshots
  `publish-<n>`, with `legacy-set-` and `proven-from-` on the key snapshot. One function formats
  every tag and one parses them. The publish and the tests reach restic through the repository
  interface, which lists snapshots with their tags and times. The stub restic records a time for
  each snapshot. The glossary defines backup job, backup set, publish number and backup pair.
- **Follows:** [the publish numbers and the fetch](../backup-publish-and-fetch.md), "The repository
  interface", "Tags", "The publish" and "When a publish or a fetch stops".
  `sketches/operations/02-types.ts`, sections A and B. `03-flow.ts`, section A.
- **Needs:** nothing. The check (open: restic tags) runs before any other work of this slice. The
  method names (open: repository method names).
- **Check:** `bun run test`, in the backup job's suites on the stub restic: one test for each line
  of "When a publish or a fetch stops" that names a stop of a publish; a failed key snapshot writes
  no data snapshot and removes no snapshot; a publish that can count from neither repository writes
  a failed receipt. `NIXIE_RESTIC_BINARY=<path_to_restic> bun run test:restic`, in
  `e2e/backup-fetch.restic.test.ts`, which this slice creates: restic stores each tag as written,
  and the key snapshot is written first. A restic lane that skips has not passed.
- **Deploy:** the backup job's write order changes: a key snapshot that fails also skips the data
  snapshot. No migration.
- **Rollback:** needs no step. The release before reads repositories that this build wrote and reads
  no tag. Its backup job writes snapshots with none of the 3 tags and removes the numbered key
  snapshot with its `proven-from-` tag. The fetch reads such snapshots as unnumbered, and the next
  numbered key snapshot takes `proven-from-<n>` with its own number.
- **Milestone:** 4. [The backup and recovery issue](https://linear.app/zgeoff/issue/GEO-1816).

### operations-10. The pick, the fetch and the snapshot list

- **Outcome:** `pickNewestKey` and `pickBackupPair` exist. The backup image has the commands
  `nixie-backup fetch` and `nixie-backup snapshots`. The repository interface restores a snapshot
  into a directory as bytes. The unfinished-backup marker's name lives in the wire lib, with the
  same value, and the log module reads it from there. The wire lib holds the `FetchedPair` schema.
- **Follows:** [the publish numbers and the fetch](../backup-publish-and-fetch.md), "The pick" and
  "The fetch command". `02-types.ts`, sections C to E. `03-flow.ts`, sections B to D. `01-usage.ts`,
  section A.
- **Needs:** operations-9. (open: refusal texts), (open: fetch step names).
- **Check:** `bun run test`, in the backup job's suites: both pick functions give each row of the
  pick's table and each refusal, the clock case included, on snapshot lists written in the test; on
  the stub restic, the fetch refuses a data snapshot that is ahead of the key copy, writes
  `fetched-pair.json`, picks again when a publish lands during the fetch, fails at the fourth
  change, and a stopped fetch has its marker in place. `bun run test:restic`, in
  `e2e/backup-fetch.restic.test.ts`: a publish and a fetch through real restic repositories on local
  disk give 2 intact database files.
- **Rollback:** needs no step. The release before has no fetch command.
- **Milestone:** 4. [The backup and recovery issue](https://linear.app/zgeoff/issue/GEO-1816).

### operations-11. The restore reads the pair and writes the restore note

- **Outcome:** `restoreDataBackup` reads `fetched-pair.json`, empties the staging folder of set
  folders under the backup job's staging lock, writes `restore-note.json`, and returns the pair. The
  wire lib holds the `RestoreNote` name and schema. The backup and restore design of the platform
  names the one fetch command in place of its 2 commands. No deployment script reads a repository:
  the fetch command replaces it.
- **Follows:** [backup and recovery](../backup-and-recovery.md), "The restore", steps 1 to 5.
  `02-types.ts`, sections D and F. `03-flow.ts`, section E.
- **Needs:** operations-10. (open: restore result), (open: forgottenItems value).
- **Check:** `bun run test`, in the log module's tests of `restoreDataBackup`, which exist: a
  restore with a `fetched-pair.json` that does not parse replaces nothing; a restore ends with no
  set folder in staging and the restore note written; a second pass writes the same note; a restore
  that cannot take the staging lock fails with the marker in place. The test of a damaged copy
  exists and passes. `bun run test:restic`, in `e2e/backup-fetch.restic.test.ts`: publish, fetch and
  restore through real restic, and a damaged snapshot replaces nothing.
- **Rollback:** needs no step. The release before ignores `fetched-pair.json` and writes no restore
  note. Its backup job and its nixie skip `restore-note.json`, because the name is no set. Between
  this slice and slice 12, step 6 of the restore removes the marker and nixie starts with no
  recovery hold.
- **Milestone:** 4. [The backup and recovery issue](https://linear.app/zgeoff/issue/GEO-1816).

### operations-12. The `holding` marker and the reader gate

- **Outcome:** `RestoreState` has `holding`, the restore writes the `PendingRestore` payload at step
  6, `startWriter` takes `installsRecoveryHolds`, and the writer carries `pendingRestore`. The db
  lib has `closeToOlderReaders`, `reopenToOlderReaders` and `syncRecoveryHoldGate`, and the
  migration runner never lowers `oldest_reader` while the gate is closed. The tasks design and the
  backup and restore design of the platform say that the restore writes a marker and the next start
  installs the holds.
- **Follows:** [backup and recovery](../backup-and-recovery.md), "The restore" step 6, "The restore
  marker" and "The reader gate". `02-types.ts`, sections G and J. `03-flow.ts`, sections E and I.
- **Needs:** operations-4, operations-11. operations-4 gives `ctx.seed`. The gate's column comes
  with the migration of operations-13, which needs this slice, so the 2 slices ship together: the db
  lib's cases of the check pass only with that migration.
- **Check:** `bun run test`, in the log module: a restore ends with the marker in `holding`; a kill
  before `holding` gives `replacing`; an empty marker reads as `replacing`; `startWriter` refuses a
  caller without `installsRecoveryHolds` on `holding`. In the db lib: with the gate closed, a schema
  that writes the version before the hold migration is refused with `SchemaTooNewError`, and after
  `reopenToOlderReaders` it is accepted.
- **Rollback:** the release before refuses to start on a marker in `holding`, as on any marker.
- **Milestone:** 4. [The backup and recovery issue](https://linear.app/zgeoff/issue/GEO-1816).

### operations-13. The tables, the records and the claim check

- **Outcome:** One appended migration adds `recovery_holds`, `recoveries` and `open_oldest_reader`.
  The tasks module owns the 3 record kinds and their fold. `readCandidate` returns a
  `ClaimCandidate`, `claimLease` refuses a candidate with a held subject, and each candidate query
  filters with `buildRecoveryHoldCheck`. The tasks module exports `isRecoveryHeld` and
  `placeRecoveryHoldsInTransaction`. The glossary defines recovery hold, recovery and hold release.
- **Follows:** [backup and recovery](../backup-and-recovery.md), "The tables and the records" and
  "The claim check". `02-types.ts`, sections H, I, K and L. `03-flow.ts`, sections F and G.
- **Needs:** operations-12, tasks-3. The check (open: unknown kind readers) runs first. tasks-3, the
  task run records in [the tasks slices](tasks.md), changes the same claim: it is milestone 3 and
  lands first. After it, the claim's transaction writes `task.run_opened`, and the hold check of
  this slice sits before that write, so a refused claim writes no record.
- **Check:** `bun run test`, in the tasks module and the actions module: a claim for a step of a
  held task, by each runner, is refused and writes no record; a queued action of a held task starts
  no attempt, an action with a started attempt included; an inbox record and a fired timer land on
  the held task's thread; a held task at the head of the order does not hide the work behind it; a
  second place with the same `recoveryID` writes nothing. The tests place a hold through
  `placeRecoveryHoldsInTransaction`.
- **Migration:** 2 tables and one nullable column.
- **Rollback:** release every recovery hold first. While one exists, the release before refuses to
  start with `SchemaTooNewError`. With none, it starts, never selects the 2 tables or the column,
  and skips the 3 kinds.
- **Milestone:** 4. [The backup and recovery issue](https://linear.app/zgeoff/issue/GEO-1816).

### operations-14. The install at the next start

- **Outcome:** The start part `recovery_holds` runs `installRestoreHolds` and removes the marker,
  with its 2 fault points, and the start part `recovery` needs it. The server app holds the exempt
  task IDs.
- **Follows:** [backup and recovery](../backup-and-recovery.md), "Which tasks a restore holds" and
  "The next start". `02-types.ts`, sections L and M. `03-flow.ts`, section F.
- **Needs:** operations-13. The check (open: done task pending action) runs first. (open: held
  tasks).
- **Check:** `bun run test:e2e`, extending `e2e/backup-restore.test.ts`, which exists: back up a
  spawned nixie on a scripted model, restore into an empty data directory, start, send a message and
  advance a timer; no step starts. `bun run test:e2e`, in a suite that this slice creates in
  `e2e/crash/`: after a kill at `recovery.holds.committed` and at `recovery.holds.marker_cleared`,
  the next start takes no step of a held task and holds no task twice. A restore test never turns
  the note-taker on.
- **Rollback:** as slice 13.
- **Milestone:** 4. [The backup and recovery issue](https://linear.app/zgeoff/issue/GEO-1816).

### operations-15. The hold release

- **Outcome:** `releaseRecoveryHolds` exists, and the hold release of the last hold reopens the
  reader gate.
- **Follows:** [the hold release](../recovery-release.md), "The hold release". `02-types.ts`,
  section L. `03-flow.ts`, sections H and I.
- **Needs:** operations-13.
- **Check:** `bun run test`, in the tasks module: a hold release puts the task in the state its
  records give it, and the next claim takes it; one transaction deletes the hold and writes
  `recovery.hold_released` for a task on whose thread a notice from nixie waits; the hold release of
  a closed task clears the hold. In the db lib: with one hold open the gate is closed, and after the
  last hold release it is open. The case of a fire that waits is a check of the definitions family
  (open: recovery hold fire).
- **Rollback:** as slice 13.
- **Milestone:** 4. [The backup and recovery issue](https://linear.app/zgeoff/issue/GEO-1816).

### operations-16. The API, the host commands and the client

- **Outcome:** `recovery/read`, `tasks/release` and `isHeld` exist, with `nixie recovery` and
  `nixie task-release`. The web client shows a held task and offers its hold release.
- **Follows:** [the hold release](../recovery-release.md), "The API and the host commands".
  `02-types.ts`, section N. `01-usage.ts`, section B.
- **Needs:** operations-14, operations-15. (open: recovery read null), (open: release control name),
  (open: refusal texts).
- **Check:** `bun run test`, in the API module: `tasks/release` returns the task's state and refuses
  a task with no hold with `TASK_NOT_HELD`. `bun run test:e2e`, in `e2e/backup-restore.test.ts`:
  `nixie recovery` lists each held task, and after `nixie task-release` the waiting step starts.
  `bun run test:browser` for the client.
- **Rollback:** a client of the release before ignores `isHeld`.
- **Milestone:** 4. [The backup and recovery issue](https://linear.app/zgeoff/issue/GEO-1816).

### operations-17. The restore notice

- **Outcome:** The hold release of the conversation writes the `recovery.notice` record, and
  `SystemMessageType` has `restore`.
- **Follows:** [the hold release](../recovery-release.md), "The restore notice". `02-types.ts`,
  section O. `03-flow.ts`, section H.
- **Needs:** operations-15, tasks-2. tasks-2, in [the tasks slices](tasks.md), gives the envelope
  for a notice from nixie. (open: restore notice), and the date format in the open list under
  "restore notice text".
- **Check:** `bun run test`, in the tasks module and the sessions module: the hold release of the
  conversation writes one notice in its transaction; the record wakes no step; the agent's next turn
  renders the sentence pair of section O; a restore that holds no conversation writes the notice in
  the start part.
- **Rollback:** the release before skips the notice's kind (open: unknown kind readers).
- **Milestone:** 4. [The backup and recovery issue](https://linear.app/zgeoff/issue/GEO-1816).

### operations-18. The backup schedule under a recovery hold

- **Outcome:** The backup schedule stages no backup set while a recovery hold is open.
- **Follows:** [the hold release](../recovery-release.md), "The first publish after a restore".
- **Needs:** operations-13. (open: first publish), (open: schedule hold read). The read is not
  designed, so this slice has no gate until it is.
- **Check:** `bun run test`, in the backup module: with one hold open, a due schedule stages
  nothing; after the last hold release, the next due time stages a backup set.
- **Rollback:** the release before stages on its schedule from its first start.
- **Milestone:** 4. [The backup and recovery issue](https://linear.app/zgeoff/issue/GEO-1816).

### operations-19. The restore runbook

- **Outcome:** `docs/runbooks/restore.md` exists with the 8 steps and the 5 notes.
- **Follows:** [the hold release](../recovery-release.md), "The restore runbook" and "What you
  approve".
- **Needs:** operations-10, operations-11, operations-16. (open: named snapshot window).
- **Check:** `bun run check:docs` lists no fault for the runbook.
- **Milestone:** 4. [The backup and recovery issue](https://linear.app/zgeoff/issue/GEO-1816).

### operations-20. The 2 checks by hand

- **Outcome:** The pull request quotes 2 pieces of evidence. First: the image of the release before
  refuses to start on a data directory with an open recovery hold, and starts on it after the last
  hold release. Second: a recorded drill, a restore onto a fresh Kubernetes volume from the 2
  repositories, the deployment repo and the recovery key, with recovered tasks held.
- **Follows:** [the hold release](../recovery-release.md), "The drill" and "What you approve".
- **Needs:** operations-5, operations-9 to operations-19. You: a cluster, both repositories'
  credentials and the recovery key (open: drill credential). operations-5 closes (open: previous
  bundle). When it finds that the e2e lane can build a previous release, the first check is an e2e
  test in `e2e/recovery-hold-previous-release.test.ts`, which this slice then creates. Otherwise the
  delivery brief gives the steps on the 2 release images, with their digests.
- **Check:** by hand, on a host that holds no production data, with no turn. The pull request quotes
  each image's start log, and the output of `nixie recovery` from the drill. The drill follows
  `docs/runbooks/restore.md`.
- **Milestone:** 4. [The backup and recovery issue](https://linear.app/zgeoff/issue/GEO-1816).
