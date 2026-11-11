# Open items: operations

Every item of the operations design that is not settled. A doc or a sketch marks the place with
`(open: <name>)`, and the name is the bold text of the item here. The docs:
[the backup job's publish numbers and the fetch](../backup-publish-and-fetch.md),
[backup and recovery](../backup-and-recovery.md), [the hold release](../recovery-release.md),
[the rollback check](../rollback-check.md), [the seed rules](../seed-rules.md) and
[the evidence lanes](../evidence-lanes.md). The sketches are in `sketches/operations/`.

The issues: [the backup and recovery issue](https://linear.app/zgeoff/issue/GEO-1816),
[the rollback check issue](https://linear.app/zgeoff/issue/GEO-2529) and
[the seed rollout issue](https://linear.app/zgeoff/issue/GEO-2081). The evidence lanes have no
issue.

## Items that block a slice

Each item starts with its milestone and the slices that it blocks. An item blocks a slice when the
slice cannot be built or checked until the item is settled. [The open list](../open.md) holds every
blocking item of the queue.

- Slice 1: lint config version.
- Slice 2: test API actions.
- Slice 3: identities writer.
- Slice 5: previous bundle.
- Slice 6: check location; rollback target source; check log; check pass; expected results; check
  blocks; further back.
- Slice 7: in part: status procedures.
- Slice 9: set identity; restic tags.
- Slice 10: one fetch command; stopped fetch; named snapshot window; repository method names;
  refusal texts; fetch step names.
- Slice 11: forgotten items; forgottenItems value; restore result.
- Slice 12: restore step order.
- Slice 13: hold design; unknown kind readers.
- Slice 14: held tasks; holds always; done task pending action; in part: finish-forgets place;
  launch sources.
- Slice 15: release one or all.
- Slice 16: release control name; recovery read null; refusal texts.
- Slice 17: restore notice; restore notice text.
- Slice 18: first publish; schedule hold read.
- Slice 19: named snapshot window.
- Slice 20: drill credential.

## Not decided

Backup and recovery. Milestone 4's choices are yours, and you make them just before its build.

- **set identity.** Milestone 4. Blocks slice 9. The identity of a backup set. (a) The backup job
  counts publishes in the repositories and tags `publish-<n>`, with the restore note and
  `proven-from-<n>`. (b) A sequence floor in staging, and gap ranges. (c) A random set ID and a
  lineage that nixie stores. Intended: (a), which the docs state. Its cost: the key snapshot is
  written first, so a host lost between the 2 writes makes the default fetch refuse until you name a
  data snapshot. Take (c) if nixie itself must read a set's identity.
- **one fetch command.** Milestone 4. Blocks slice 10. (a) One command that fetches the pair. (b)
  `fetch data` and `fetch keys`. Intended: (a). Two commands cannot refuse a data copy that is ahead
  of the key copy.
- **stopped fetch.** Milestone 4. Blocks slice 10. How `nixie restore` refuses a stopped fetch. (a)
  The unfinished-backup marker. (b) A manifest with checksums. Intended: (a).
- **named snapshot window.** Milestone 4. Blocks slices 10 and 19. A named data snapshot from before
  a restore of a local directory. (a) The fetch refuses it as `data-unproven`. (b) A flag accepts
  it. Intended: (a). A further option closes the window in which the newest key snapshot has no
  publish number: refuse every named data snapshot under such a key copy. Its cost: no restore of a
  data copy with a lower number from repositories that no numbered publish has reached. The docs do
  not close the window, and the runbook warns of it.
- **forgotten items.** Milestone 4. Blocks slice 11. Items forgotten after the data snapshot of an
  `older-data` pair. (a) They are unreadable. (b) The restore finishes each forget whose key is
  gone. (c) `--data-snapshot` comes only with a warning in the runbook. Intended: (b), as a
  follow-up if it does not fit the issue.
- **finish-forgets place.** Milestone 4. Blocks part of slice 14. Where a `finish-forgets` runs, if
  you choose it. (a) At the next start, in the start part `recovery_holds` and in its transaction,
  after the migrations. (b) In `nixie restore`. Intended: (a). Under (a), `PendingRestore` has
  `relation: PairRelation | null`, `installRestoreHolds` takes
  `finishForgets?: (tx) => Promise<number>`, which returns the count of forgets it finished, and the
  server app passes it only when `pending.relation` is `older-data`.
- **forgottenItems value.** Milestone 4. Blocks slice 11. The value of `forgottenItems` that
  `nixie restore` passes in the first build. Options: `leave-unreadable` or `finish-forgets`.
  Intended: `leave-unreadable`, which follows from the finish as a follow-up.
- **hold design.** Milestone 4. Blocks slice 13. (a) One table keyed by subject, with a launch
  checked outside `claimLease`. (b) A table shaped like `leases`, where a close also ends a hold.
  (c) Claim candidates that name their hold subjects, with a `recoveries` table. Intended: (c),
  which the docs state. Its cost: one recovery hold stops the release before from starting.
- **held tasks.** Milestone 4. Blocks slice 14. Which tasks a restore holds. (a) Every unfinished
  task. (b) All but the conversation. (c) All but the conversation and the system tasks. (d) As (a),
  less `memory-writer` and `memory-consolidator`. Intended: (d). It changes `exemptTaskIDs` only.
- **holds always.** Milestone 4. Blocks slice 14. (a) Every restore installs holds. (b) A flag turns
  them off. Intended: (a). Under (b), `nixie restore` passes `hold: !flags.noHolds`, and
  `restoreDataBackup` refuses `hold: false` with `finish-forgets` for an `older-data` pair, at
  step 1.
- **release control name.** Milestone 4. Blocks slice 16. (a) A 7th control, `release`. (b) `resume`
  also clears a recovery hold. Intended: (a). Under (b), the control's transaction releases before
  it plans.
- **release one or all.** Milestone 4. Blocks slice 15. (a) One task a call. (b) A hold release of
  all as well. Intended: (a) for the first build. It changes `subjects` only.
- **restore notice.** Milestone 4. Blocks slice 17. Whether the agent is told of a restore. (a) No
  notice. (b) The restore notice. Intended: (b). The kind's name, `recovery.notice`, is open too.
- **launch sources.** Milestone 4. Blocks part of slice 14. Whether a restore holds launch sources.
  (a) None. (b) Each trigger source, with a gate in the trigger core, a `launchSources` list in
  `recovery/read` and a hold release for a source. Intended: (a) for the first build. (b) needs 2
  shapes that nothing defines.
- **first publish.** Milestone 4. Blocks slice 18. The first publish after a restore. (a) nixie
  stages a backup set on its schedule from the first start. (b) nixie stages no backup set while a
  recovery hold is open, and the runbook has the backup job stopped until you start it. (c) The
  runbook starts the restored nixie with `backup.enabled: false`. Intended: (b).
- **restore step order.** Milestone 4. Blocks slice 12. (a) Move, empty staging and write the note,
  then `holding`. (b) `holding` first, then staging. Intended: (a), which the docs state.
- **drill credential.** Milestone 4. Blocks slice 20. The drill's access to the repositories. (a)
  The backup job's own read and write credential. (b) A credential that cannot delete. Intended: (b)
  where the backend offers one, with backups off on the drill nixie either way.
- **recovery read null.** Milestone 4. Blocks slice 16. When `recovery/read` returns
  `recovery: null`. Options: only on a deployment that never restored, or also after the last hold
  release. Nothing gives an intended one.

The rollback check. None has an intended option.

- **check location.** Milestone 1. Blocks slice 6. Where the check runs: an e2e test on a bundle
  built from the rollback target's tag; a job on the 2 release images; or by hand on a host that
  holds no production data, with each image's start log quoted.
- **rollback target source.** Milestone 1. Blocks slice 6. How the check learns the last release
  that a deployment ran: the highest `v*` tag; a tag you name for each milestone; or a value that
  the deployment's repo gives.
- **check log.** Milestone 1. Blocks slice 6. How the log of the release to deploy is made: a
  spawned nixie on a scripted model that exercises each added record kind; or a committed fixture.
- **check pass.** Milestone 1. Blocks slice 6. What counts as a pass: the rollback target reaches
  ready; or it also reads back the records it knows.
- **expected results.** Milestone 1. Blocks slice 6. Where the expected result for each record kind,
  migration and config key lives: one list in the repo that each design's pull request extends; or
  each design's own tests.
- **check blocks.** Milestone 1. Blocks slice 6. Whether a failed check blocks the release, or only
  the milestone deploy.
- **further back.** Milestone 1. Blocks slice 6. Whether the check also covers a release further
  back than the rollback target, for a deployment that skips a milestone.

Other choices.

- **status procedures.** Milestone 1. Blocks part of slice 7. Whether `memory/writerStatus` and
  `memory/consolidatorStatus` go with the delete of the 2 built-in memory tasks. (a) Both remain,
  deprecated, and each returns `isEnabled: false`. (b) Both go, with the 2 status mocks of the web
  client. Intended: (a). The memory family's doc for that delete holds the choice. Under (b),
  "Read-only read of production" has 2 fewer read procedures.
- **operations slice order.** Milestone 4. Blocks no slice. The order of the slices inside each
  issue is a first draft with no stated reason, except where a slice's Needs line gives a
  dependency. The order of recovery slice 13 against the task run records of the tasks family is one
  such case: both change `claimLease`.

## Not checked

- **restic tags.** Milestone 4. Blocks slice 9. restic stores a tag of the shapes `publish-<n>`,
  `legacy-set-<sequence>` and `proven-from-<n>` as written, and lists it back. The first case of the
  suite that slice 9 creates writes one snapshot with the 3 tags and reads them from the snapshot
  list: `NIXIE_RESTIC_BINARY=<path_to_restic> bun run test:restic`. Stored as written: build as the
  docs say. Changed or refused: change the tag format before any other work of slice 9.
- **older-data guarantee.** Milestone 4. Blocks no slice. Only a forget deletes a row of
  `record_keys`. Check:
  `git grep -n -e removeRecordKey -e removeThreadKeys -e "deleteFrom('record_keys')" -- modules apps libs ':!*.test.ts'`,
  then read each caller. One pass of the grep on the design's commit lists callers in the compaction
  module (summary keys), the memory module (proposals, offers, unpublished items), the conversation
  reset and the log reset, beside the forgets. Nobody has read each caller. Only forgets: the
  guarantee stands. Any other caller: a `finish-forgets` finishes only a record that a forget's
  start record names, and the guarantee's sentence narrows to match. The item gates the
  `finish-forgets` step only.
- **unknown kind readers.** Milestone 4. Blocks slice 13. Every thread reader of the release before
  skips a record of a kind it does not know. 3 tests on the code before slice 13: one in the
  sessions module that rebuilds a session from a thread with a `recovery.hold_placed` record, one in
  the sessions module that renders an inbox with a record of an unknown inbox kind, and one in the
  web client that renders a thread page with it. `bun run test`, then `bun run test:browser`. All
  pass: the 3 kinds are on the task's thread. One throws: fix that reader in a release before the
  hold ships, or write the 3 kinds on no thread, which costs `recovery/read` a join by `subject`.
- **done task pending action.** Milestone 4. Blocks slice 14. A done or stopped task can own a
  pending action with a started attempt. A test in the actions module seeds a done task with a
  pending action whose attempt started, and claims it. `bun run test`. Claimed: the install must
  hold a task that owns a pending action, as designed. Never claimed: the design holds, and
  `readTasksWithPendingActions` is a guard with no known case.
- **previous bundle.** Milestone 1. Blocks slice 5. A test lane can build and start the server
  bundle of a previous release, from its `v*` tag, on a data directory that this build wrote. One
  e2e test builds the tag's bundle from a git worktree and starts it on such a data directory:
  `bun run test:e2e`. Builds inside the lane's time: the rollback check and the hold's check on the
  release before can run as e2e tests. Does not: both run on release images, by hand or in a job of
  their own. `git tag -l 'v*' --sort=version:refname` gives the highest tag last.
- **one release back.** Milestone 1. Blocks no slice. Each statement of these docs and slices about
  the release before holds for a rollback by one release. Nobody has checked a release further back,
  which a milestone rollback can reach. The check is the rollback check itself, once it exists.
  Until then each Rollback line of the slices is a statement for one release back.
- **test API actions.** Milestone: no deploy. Blocks slice 2. The test API reads back an action that
  the actions module made. A test in the test file of `startTestAPI` starts the test API, creates an
  action through the actions module's own create function, and reads it back through the API.
  `bun run test`. Passes: nothing changes. Fails: `startTestAPI` registers `actionsProjection` too.
  The pull request says which result it got.
- **identities writer.** Milestone: no deploy. Blocks slice 3. One module writes `identities`.
  Check: `git grep -n "insertInto('identities')" -- modules apps libs ':!*.test.ts'`. One pass on
  the design's commit gives one writer, in the API module. One writer: that module publishes the
  identity seeds. More: each writer's module publishes the seeds for its own write.
- **list command writes.** Milestone 1. Blocks no slice. No host command that lists writes a record.
  Check:
  `git grep -n -E "'(health|sessions|memory-pending|skill-pending|skill-written|prompt-pending|memory-subjects)'" -- apps/server/src ':!*.test.ts'`,
  then read each handler down to its host procedure for a write transaction. No write: the read
  path's side effect is none. A write: the row of the read path names it.

## Not written

- **repository method names.** Milestone 4. Blocks slice 10. The 2 methods that the repository
  interface adds have no agreed names. The sketch writes `readSnapshots` and `restoreSnapshot`.
- **refusal texts.** Milestone 4. Blocks slices 10 and 16. No text exists for the `message` of any
  `PairRefusal`, for the last line of `nixie restore`, or for the message of `TASK_NOT_HELD`.
  Intended rules: the message of `no-data-of-publish` names the data snapshot with the highest
  publish number that the key copy accepts, and the last line of the restore names `nixie recovery`.
- **fetch step names.** Milestone 4. Blocks slice 10. `backup.fetch_failed` carries a step, and only
  `pick` is named. The values of `repository` in a line of `nixie-backup snapshots` are the sketch's
  own.
- **schedule hold read.** Milestone 4. Blocks slice 18. Under the intended option of **first
  publish**, the backup schedule reads whether a recovery hold is open before it stages a backup
  set. The read, its module and its transaction are not designed. The backup module must not form a
  cycle with the tasks module.
- **restore notice text.** Milestone 4. Blocks slice 17. The restore notice has one example sentence
  pair and no rule for the date format or the time zone.
- **lint config version.** Milestone: no deploy. Blocks slice 1. The 2 seed rules are in
  `@zgeoff/oxlint-config` 0.10.1, and a fix to `seed-only` is in a release after it. No version is
  named for the bump. Intended: the first release that holds the fix.

## Known faults

- **restore result.** Milestone 4. Blocks slice 11. One statement gives `restoreDataBackup` the
  result `Promise<{ pair: FetchedPair | null }>`. The code returns `DataRestore | DataRefusal`. The
  sketch follows the code and adds `pair` to `DataRestore`.
- "recovery hold fire" is filed once, in [the definitions list](definitions.md#not-decided).
- **named snapshot rule.** Milestone 4. Blocks no slice. One statement has the table of the pick as
  it is for the window in which the newest key snapshot has no publish number, and the runbook
  warns. Another offers to refuse every named data snapshot in that window. The docs follow the
  first, under **named snapshot window**.
- **pairing rule name.** Milestone: no deploy. Blocks no slice. The seed issue names a "pairing"
  rule. The lint config names it `zgeoff/test-beside-seed`, and the docs follow the config.
- **seed acceptance.** Milestone: no deploy. Blocks no slice. The seed issue's acceptance greps only
  `actions` inserts in the API module. More writes sit outside their modules, and the lint is the
  gate that the slices follow.
- **two fetch commands.** Milestone 4. Blocks no slice. The backup and restore design of the
  platform names 2 commands, `nixie-backup fetch data latest` and `fetch keys latest`. These docs
  follow the one command, under **one fetch command**.
- **holds in the restore.** Milestone 4. Blocks no slice. The tasks design and the backup and
  restore design of the platform say that the restore commits the recovery holds with the recovered
  database. These docs follow the marker: the restore writes the `holding` payload, and the next
  start installs the holds.
