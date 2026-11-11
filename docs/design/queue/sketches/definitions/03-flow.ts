// Task definitions: each flow as commented code.
// A sketch. Nothing compiles it and no package imports it.
// The sketches hold the shapes and the exact texts. The docs hold the rules.
// A place marked `(open: <name>)` is not settled: see ../../open/definitions.md.
// Types: 02-types.ts.

// ---- A. One seed, in one transaction ----

function seedInOneTransaction(tx) {
  // Runs in runSeed and in the in-force seed. The settled order is: refusals, the binding hook,
  // the arming hook, the `unchanged` return. The place of steps 3, 4 and 9 is this sketch's own
  // (open: seed step order).
  // 1. Parse tasks/ from the files' text. The parser reads no source.
  // 2. Check every refusal (02-types.ts, section C). A refused seed throws here: nothing below
  //    happens, and the last seed's definitions stay in force.
  // 3. Store each version under its hash in task_definition_versions.
  // 4. Lay the runtime changes in force over the repo's definitions (section L).
  // 5. Build the 2 lists. A spent one-shot is left out of both.
  const tasksInForce = []; // each enabled definition with `target: task`, trigger or not
  const armedInForce = []; // each enabled definition that has a trigger, either target

  // 6. Bind the tasks first, so a fire never finds a definition with no task.
  writeDefinitionTasksInTransaction(tx, context, tasksInForce);
  // 7. Arm the triggers. The definitions module imports the triggers module and calls the hook
  //    itself: a function passed in is one a second seed path can leave out.
  writeArmedDefinitions(tx, log, { definitions, inForce: armedInForce });
  // 8. Only after both hooks: return `unchanged` when the snapshot hash is the one in force.
  //    So a start after a release that never called the hooks repairs the rows.
  // 9. When the snapshot hash differs, the seed writes its record.
}

function writeDefinitionTasksInTransaction(tx, context, inForce) {
  // Diffs the list against the `tasks` rows that have definition_id set. One record per row that
  // differs.
  for (const definition of inForce) {
    // no row for this definition ID:
    //   write task.created { taskID: createShortID(), isConversation: false, state: 'waiting' }
    //   write task.definition_set { taskID, definitionID, definitionHash }          -> created
    // row with another hash, or a null hash:
    //   write task.definition_set { taskID, definitionID, definitionHash }          -> set
    // row with the same hash: nothing.
  }
  // each row whose definition is not in the list and whose hash is not null:
  //   write task.definition_set { taskID, definitionID, definitionHash: null }      -> withdrawn
  // A second task.created with a task.definition_set for one definition fails the unique index,
  // and with it the transaction.
}

function writeDefinitionBindingInTransaction(tx, context, binding) {
  // binding: { definitionID, taskID, definitionHash }
  // A first bind refuses:
  //   a task that is missing;
  //   a task that is the conversation;
  //   a task that has a starter;
  //   a task that does not wait with nothing unread;
  //   a definition already bound to another task;
  //   a task already bound to another definition.
  // The same binding with the same hash: { status: 'unchanged' }.
  //
  // A migration step that binds a definition ID to a task that exists calls this with a null
  // hash before the first seed. The seed that sets the hash then finds nothing to claim and
  // creates no second task. No built-in task needs this.
}

// ---- B. What starts a task run: pickRunDefinition ----

function pickRunDefinition({ row, unreadInbox, controls, lastRun }) {
  // The order of the tests against the claim's own checks of a raise, a restart and the limit
  // hold is not settled (open: claim order).
  // Asked by the claim when a definition's task has no open task run, and by
  // readDefinitionTaskInTransaction. Pure. The first test that holds wins.
  // 1. An unread trigger.fired record whose dedupe key no task run of the task holds.
  //    Asks nothing of the hash in force: a written fire is a pending task run. So a one-shot,
  //    whose own fire takes it out of force, runs.
  //    More than one such fire unread: the newest wins. The first step acknowledges them all and
  //    shows only its own.
  //    -> open a task run. Pin the fire's definitionHash. triggerKey: the fire's dedupe key.
  // 2. An unread waking message, and the hash in force is not null.
  //    -> open a task run. Pin the hash in force.
  // 3. A raise or a restart whose control record is later than the end of the task's last task
  //    run, and that task run ended with `limit`, `stopped` or `failed`.
  //    -> open a task run that carries that work on. Pin the hash of that last task run.
  //       Resume its session, also under `context: fresh`.
  //       Copy its triggerKey and briefID; name it in carriesRunID.
  // 4. Anything else: a resume, a server start, a recovery, a message while the hash is null.
  //    -> rest. Read nothing. runTaskStep commits the step with `hold` and calls no runner, so
  //       the task returns to `waiting` and a message it held is unread after the step.
}

function claimDefinitionTask(task) {
  // An open task run that is pending, active or waiting on a reply: join it.
  // An idle open task run, and an unread trigger.fired with another dedupe key: end the idle task
  //   run with `no_report` and open the next in the same transaction. It pins the fire's hash.
  // No open task run: pickRunDefinition.
  //
  // task.run_opened (../../task-runs-and-reports.md) takes definitionID, definitionHash and
  // triggerKey from pickRunDefinition.
  // `context: fresh` opens a session of its own. `context: continuing` resumes at the last
  // committed boundary.
}

// ---- C. What each fire gets: readDefinitionTaskInTransaction ----

function readDefinitionTaskInTransaction(tx, definitionID) {
  // Runs inside the transaction that delivers the fire, before the write for that event, so an
  // inbox write never throws inside a batch.
  // Reads: the `tasks` row, the limit hold, the recovery hold (open: recovery hold fire), the
  // task's unread inbox records, and readRunState of the task run boundary.
  // No row with this definition ID: null.
  // The first test that holds wins.
  // 1. The task is paused, stopped or failed, held at its limit, or under a recovery hold
  //    (open: recovery hold fire).
  //    -> 'held'. deliver writes trigger.skipped with `task_held`.
  //       It fires again at the first slot after you resume, restart, raise or release it.
  // 2. A task run is pending, active or waiting on a reply; or a trigger.fired record is unread
  //    whose dedupe key no task run of the task holds.
  //    -> 'still_running'. deliver writes trigger.skipped with `still_running`.
  //       It fires again when the task run ends.
  //    `pending` is worked out here and never read from the table of task runs, which has no
  //    row before a claim opens a task run:
  //      no open task run: 'still_running' when pickRunDefinition would open one at a claim.
  //      an idle open task run: 'still_running' when a trigger.fired record is unread whose
  //        dedupe key no task run of the task holds.
  // 3. No task run, or an idle one, and no such fire unread.
  //    -> 'take'. deliver writes trigger.fired, and the task wakes at once.
  // Result: at most one trigger.fired record is unread on a task, wakeable or not, however late
  // the claim comes. One exception: after a stop there can be 2.
}

// ---- D. What each path of a started task does with a definition's task ----

// claimTask            The `started` pool, which the nixie runner serves, takes a task with
//                      definition_id set. The other pool omits it.
// reviveHeldTasks      No change. It reads `started_by is not null`, so it never revives the task.
// The commit           pickNextState turns `done` into `waiting` for a task with definition_id set.
// The controls         A close is refused: `definition_task_never_closes`. Pause, resume, stop,
//                      restart and interrupt work as for a started task. Only a restart can open
//                      a task run, by test 3 of pickRunDefinition.
// readTaskSetup        Returns the `definition` member of TaskSetup: ../tasks/02-types.ts,
//                      section P.
// The nixie runner     Reads the options from readDefinitionVersion of the open task run's pinned
//                      hash, and the report mode and limits from task.run_opened.
//                      Under `fresh`: the step whose key is the task run's `openedByStep` gets a
//                      null session boundary, also on its rerun.
//                      Under `continuing`: every step resumes tasks.session_boundary.
// readTurnContext      No start note. The first input of a task run is its trigger.fired record,
//                      or the message that woke it. The <input> block named `trigger`
//                      (02-types.ts, section G) sits where ../../task-brief.md puts it in the
//                      order of the first message. The brief is the brief of the pinned version.
//                      A task run that a message opened has no `trigger` block.
//                      A task run that a raise or a restart opened shows the `trigger` block of
//                      the fire that began the work it carries on.
// The directory        Lists a task only while its hash is not null, so task.message cannot name
//                      a task whose hash is null.
// tasks.list and the   One row per task whose hash is not null: the name, brief and model of the
// dashboard            version in force, and TaskProfile.wakeable from its `wakeable`.
//                      A task whose hash is null is listed while a task run of it is pending or
//                      open,
//                      with the name of the version that task run pinned, so you can reach its
//                      stop control. After that it is left out.
// writeTaskLimitPause  The limit notice goes to the report target pinned on the open task run,
//                      and to nobody when that is null.
// readStartedTaskIDs   (recovery's kept sandboxes, and the runner's sweep of ended tasks)
//                      Counts a definition's task as open while its hash is not null, or while a
//                      task run of it is pending, active or waiting on a reply. Any other
//                      definition's task is ended, and its sandbox is destroyed.
// A forget's session   Reaches every task from readDefinitionTaskIDs.
// cleanup

// ---- E. Fire times, dedupe keys and the watermark ----

function readNextFire(trigger, after, zone) {
  // The pending fire of a definition: the first fire time after the watermark `after`.
  // No instant is stored.
  //
  // every: day | week   the local time `at`, or `window.from`.
  //                     key: "<definitionID>|<local date>T<HH:MM>"
  // every: hour         minute 0 of each hour in the zone.
  //                     key: "<definitionID>|<UTC instant>"
  // every: { minutes }  each instant that is a whole multiple of n minutes since the Unix epoch.
  //                     No stored anchor. key: "<definitionID>|<UTC instant>"
  // at                  once. Never reads `after`: returns its instant whatever `after` holds.
  //                     key: "<definitionID>|<UTC instant>"
  //
  // Daylight saving, for the local slots of day and week:
  //   a local time inside a gap fires at the first instant after the gap;
  //   a local time that repeats fires at its first occurrence only.
  // hour and minutes fire on UTC instants: an hour schedule fires 25 times on the autumn day and
  // 23 times on the spring day.
}

// The watermark `after` on trigger_definitions: epoch milliseconds. It never moves back.
//   trigger.armed    sets it to the record's time for an added row, a row back in force, and a
//                    changed `trigger`. Another hash with the same `trigger` does not move it. No
//                    record
//                    sets it lower than it stands.
//   trigger.fired    moves it to scheduledFor.
//   trigger.skipped  moves it to the last entry of scheduledFor, the newest.
//   The fold moves the watermark only to a greater instant, and never moves it for an `at`
//   event.
// readArmedDefinitions omits a row whose `at` key is in trigger_keys.

// ---- F. deliver ----

function deliverTriggerBatch(context, sourceID, { cursor, events }) {
  // One write transaction, through withWriteTransaction. The core takes no lease.
  const taken = [];

  for (const event of events) {
    // 1. Key in trigger_keys, or earlier in this batch: leave the event out.
    // 2. No definitionID: throw, commit nothing. A cursor never commits past an event the core
    //    cannot place. (Filter matching comes with the poll sources.)
    // 3. Stale: the definition's row is missing, withdrawn, on another source or another hash, or
    //    scheduledFor is at or before `after`. The last test does not apply to an `at` event,
    //    whose key alone decides. A stale event takes no key and writes no record.
    // 4. Write the record at once, so the read for the next event sees it:
    //      event.skip is set               -> trigger.skipped with the source's reason
    //      target: conversation            -> trigger.fired on the conversation's thread.
    //                                         No task lookup.
    //      target: task                    -> readDefinitionTask(tx, definitionID), then:
    //        null                             throw, commit nothing. The seed binds the task
    //                                         before it arms the definition, so this is a fault.
    //        'held'                           trigger.skipped with `task_held`
    //        'still_running'                  trigger.skipped with `still_running`
    //        'take'                           trigger.fired on the task's thread
    //    trigger.fired is an inbox record: the write is the wake, with the cause `event`.
    //    A second fire of one definition in the batch skips as `still_running`.
    // 5. For an `at` event, after its trigger.fired or trigger.skipped record:
    //      retireOneShot(tx, definitionID, 'one_shot_fired' | 'one_shot_skipped')
    //    (section H).
    taken.push(event.dedupeKey);
  }

  // 6. Write one trigger.delivered { source, cursor, keys: taken }. A call that took no key and
  //    left the cursor as it stands writes nothing.
  // A second write of one key fails the primary key of trigger_keys, and with it the transaction.
  return { delivered: taken.length };
}

// ---- G. The schedule source ----

function tickScheduleSource(clock) {
  // Every 20 s. Holds nothing between ticks but its failure count. Every wait reads the clock
  // the caller passes in.
  // 1. readArmedDefinitions(db, 'schedule'), the zone, the clock.
  // 2. One event for each definition's latest missed or due fire:
  //
  //    on time           delivered within 60 s of the scheduled instant.
  //    late, a schedule  interval: 24 h for day, 7 days for week, 1 h for hour, n min for minutes.
  //                      catchUp "once" and late by at most half the interval:
  //                        one event, isCatchUp true, the earlier missed times in `skipped`.
  //                      catchUp "once" and later than that:  one skip, `too_late`.
  //                      catchUp "skip":                      one skip, `catch_up_off`.
  //    late, an `at`     has no interval. Always fires, marked as a catch-up. A one-shot first
  //                      seeded after its time is a missed fire.
  //    window, no        fires at window.from. A fire missed then fires on time until
  //    idleMinutes       window.until.
  //    window with       waits from window.from until the conversation has had no message from
  //    idleMinutes       you for that many minutes. window.until passes first: one skip,
  //                      `window_closed`.
  //
  // 3. deliver the events with a null cursor.
  // A throw: the failure count rises. 3 in a row: reportHealth('unhealthy'). A restart starts the
  // count again.
  // A local slot whose key is taken (your zone changed and the slot came round twice) writes
  // nothing, and the source builds it again each tick until the next slot.
}

// ---- H. A spent one-shot ----

// Spent: trigger_keys holds the dedupe key of the definition's `at`, taken by a trigger.fired or
// a trigger.skipped record. Read through isSpentOneShot, never stored.

function retireOneShotInTransaction(tx, context, definitionID, cause) {
  // Called by deliver, inside the delivering transaction, as retireOneShot.
  // A definition held in the repo:   writes no record.
  // A definition made at runtime:    writes definition.settled
  //                                  { outcome: 'retired', cause, hash: null }
  //                                  (the outcome and hash values: open: undefined types)
  //                                  (open: retireOneShot order)
  // Then: seedInForceInTransaction(tx, options). Every seed omits a spent one-shot from both
  // hook lists, so the task's hash is null and the pending fire is withdrawn after it.
}

// A one-shot held in the repo is in its file as before. nixie writes no seed record for it.
// An edit of its `at` gives it another key, so it is not spent.
// An edit back to an instant that already fired or skipped finds that key taken: spent at once.

// ---- I. A change from chat, in one write transaction ----

function requestDefinitionChange(context, caller, request) {
  // caller not in `holders`: NOT_A_HOLDER.
  // Before the transaction:
  //   define:    build the version. Parse it with the definition schema. Check it through
  //              planTaskStart with the caller as the starter. A fault: INVALID with the sentences.
  //              Without definitionId: the ID is the slug of `name`. Slug taken: ID_TAKEN.
  //   undefine:  run a seed of the definitions source, outside the transaction, so a merge that
  //              no seed has read is adopted before the change is decided. A refused or failed
  //              seed does not stop the change.
  // In the transaction:
  //   1. Read DefinitionState. pickDefinitionMove(state, intent). A refusal writes nothing.
  //   2. Write definition.changed. The fold supersedes the change in force and inserts this one
  //      as `in_force`.
  //   3. seedInForceInTransaction:
  //        the seed plan adopts a change whose hash the repo already holds, null on both sides
  //          included, and writes definition.settled { outcome: 'adopted', cause: 'seed' };
  //        it writes definition.repo_moved for a change whose repo version moved;
  //        the seed writes its record and calls both seed hooks (section A).
  //   A throw at any step rolls back all of them: no notice, no change, no armed trigger.
  // After the commit the export wakes. Nothing waits on it.
}

// Refusals of a define and an undefine, by code (02-types.ts, section L):
//   ID_TAKEN            no definitionId, and the slug of `name` is taken
//   NOT_FOUND           the definition named does not exist
//   UNCHANGED           the version is the one in force
//   FILE_ONLY_KEYS      definitionId names a definition that holds a file-only key at a value
//                       other than its default
//   ONE_SHOT_OVER_REPO  a one-shot for a definition the repo holds
//   INVALID             the schema or planTaskStart refuses the version
//   NOT_A_HOLDER        the caller kind is not in `holders`
// The conditions for NOT_FOUND and UNCHANGED are this sketch's reading of the code names
// (open: refusal text).

// ---- J. Undo ----

function undoDefinitionChange(context, { changeID }) {
  // Runs a seed of the definitions source first, outside the transaction, as an undefine does.
  // Then, in one write transaction, it reads the state and calls pickDefinitionMove with an undo
  // intent. pickDefinitionMove decides each row below.
  // An undo is one more runtime change with its own notice. Its version is the one it restores.
  // By the change X it names:
  //
  //   X is not the head of its definition
  //       refuse REPLACED. Return the head: its change ID, short ID and operation.
  //   X in force, and `replaces` a runtime change
  //       put `previous` in force over the repo, with the base kept.
  //   X in force, `replaces` none, no conflict
  //       put `previous` in force, which is the repo's version or none. The seed in the same
  //       transaction adopts the undo, and the runtime layer is empty.
  //   X in force, `replaces` none, in conflict
  //       put the version the repo holds at the undo in force. The seed adopts it. The result
  //       says `restored: 'repo'` (open: undo output).
  //   X adopted, and the repo holds its hash
  //       put `previous` in force over the merged version. The next export removes the folder
  //       or restores the old files.
  //   X adopted, and the repo moved since
  //       refuse REPO_MOVED. Name the seed record.
  //   X retired
  //       refuse NOT_IN_FORCE with the cause.
  //
  // The restored version is a one-shot:
  //   the repo holds the definition   refuse ONE_SHOT_OVER_REPO
  //   its time has passed             refuse ONE_SHOT_PAST
  // An undo of an undo follows the same table.
  // The undo reads `replaces` to tell whether a change sits over the repo. It never compares
  // hashes for that, and it never compares a change ID with a short ID.
}

// ---- K. The export ----

// A fourth change kind of the definitions export, from buildTaskChangeKind. The shared export
// loop and the DefinitionsRepo port do not change.
//
// One export per branch. branchOf returns "nixie/tasks" for every definition.
// The export holds every runtime change in force that isExportedDefinition accepts.
//
// export ID = hash of:
//   the branch;
//   each change, with its base and its repo version;
//   the count of that branch's changes that left force;
//   the seed in force.
// So a change, an undo, an adoption, a resolution and a seed each make another export, which
// builds the branch again on the base branch's latest commit.
//
// For each change:
//   write the version's files to tasks/<id>/, with the stored text, byte for byte;
//   remove each file that the folder holds at the pinned commit and the version lacks;
//   a removal removes every file of the folder.
//
// Before it writes, the export parses the repo's files with the change laid over them:
//   a change that does not parse     fails, opens no pull request
//   a repo below format 4            fails, opens no pull request
//   a change that alters no file     fails, and is tried again at the next pass, by when a seed
//                                    has adopted it
//
// An export that is not its branch's current one closes.
// While the branch has a current export, that one rewrites the same pull request.
// Once the branch has none, the pass closes a pull request open on the branch and does not
// touch a merged one.
// A close reads the branch stored on the export's row, so a change of branchOf closes the old
// branch.
// A failure at the repo: the export is `exporting` and nixie tries it again. A write whose answer
// got lost is found by its branch at the close.
// No export configured: no kind is registered.

// ---- L. The two layers, adoption and conflict ----

// What is in force is a read and no table: the repo's definitions with the runtime changes in
// force laid over them through buildRuntimeOverlay.
//   a change with a null hash over a repo version   the definition is out of force
//   base_hash differs from definitions_hash         a conflict. Derived, never stored.
//   the head of a definition                        its change with the greatest changed_sequence
//
// A seed, per runtime change in force:
//   the repo holds the same hash      adopt: definition.settled { outcome: 'adopted' }
//   the repo holds the base           keep it in force
//   the repo holds another version    a conflict: definition.repo_moved
//
// nixie definitions resolve <id> --keep nixie   sets the base to the repo's version.
// nixie definitions resolve <id> --keep repo    retires the change (state_cause `kept_repo`).
//                                               The repo's version is in force before the commit.

// ---- M. States ----

// A definition (seed view)       in force | disabled | removed            moved by: a seed
// The binding                    none | bound                             moved by:
//                                task.definition_set, once. It never moves to another task.
// The definition, as its task    in force at a hash | out of force        moved by:
// sees it                        task.definition_set, written by the seed hook only
// A definition's task            waiting | ready | running | paused | stopped | failed.
//                                Never done or closed.
// A task run                     as the task run boundary gives it. Opened through
//                                pickRunDefinition by a fire, a waking message, or a raise or a
//                                restart of cut work.
// A definition's pending fire    none | armed | withdrawn                 moved by: trigger.armed
// A dedupe key                   free | taken for good                    moved by:
//                                trigger.delivered
// A source's health              running | unhealthy | stopped            kept in memory
// A runtime change               in_force, then once to superseded | adopted | retired, by the
//                                table of canMoveRuntimeChange, unchanged. Moved by: a later
//                                definition.changed; definition.settled;
//                                definition.conflict_resolved with `repo`.
// A definition (two layers)      none | in force from the repo | in force from a runtime change |
//                                removed by a runtime change. The last 2 with or without a
//                                conflict. Read from the 2 layers.
// An export                      exporting | opened | closed, by the table of
//                                canMoveDefinitionsExport, unchanged. Moved by:
//                                definition.export_moved.
