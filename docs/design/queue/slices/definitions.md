# Task definitions: slices 1 to 8

The work of the task definitions design, in dependency order. Slices 9 to 16 are in
[the chat, view and example slices](definitions-chat.md). The open items are in
[the definitions open list](../open/definitions.md). The split is a first draft (open: pull request
split). A test file marked "(creates)" does not exist: the slice creates it. Slice numbers of the
tasks family are those of [the task slices](tasks.md),
[the wake and grant slices](tasks-wake-and-grant.md) and [the worker slices](tasks-worker.md).

Order across the 2 families: tasks slices 3 and 8 land first. Definitions slices 1, 2 and 3 follow.
Tasks slices 4 and 7 need definitions slice 2.

Each slice has the ID `definitions-<n>`, which is unique across the queue, and each "Needs" names a
slice by its ID. In any other field of this file, "slice n" means `definitions-n`.
[The work list](../work-list.md) gives the build order.

### definitions-1. The format and the seed

[The task definitions issue](https://linear.app/zgeoff/issue/GEO-1834).

- **Outcome:** A seed loads each `tasks/<id>/` folder as a task definition with its own hash,
  refuses each fault, stores each version and writes the `tasks` list into the snapshot form.
- **Follows:** [task definitions](../task-definitions.md), every design section.
  `sketches/definitions/02-types.ts`, sections A, C and D. `sketches/definitions/03-flow.ts`,
  section A.
- **Work:**
  - `definitionsLayout.folders`: delete `jobs`, add `tasks`.
  - `isDefinitionsPath`: under `tasks/`, accept only `.yaml`, `.md` and `.ts`. Edit the tests of the
    path source and of `isDefinitionsPath` that use `jobs/`.
  - `definitionsFormats.tasks` at 4, with a reader for format 3.
  - The parser, its refusals and the definition hash.
  - One appended migration for `task_definition_versions`.
  - `buildDefinitionsSnapshot`: the `tasks` list in place of `jobs: []`.
- **Needs:** tasks-8. The task runner port gives `parseTaskStartInput`. Blocked by the open items
  "start input schema", "seed starter" and "version table columns". The check (open: definitions
  imports tasks) decides how the schema reaches the definitions module.
- **Keys that wait on a tasks slice.** Until the named slice lands, the seed refuses the key as an
  unknown key:
  - `reportShape` and `maxCalls`: tasks-3, task run records and `task.report`.
  - `log`: tasks-6, the log grant.
  - `runner`, and fault 5 of the seed: not built until "runner key" is decided.
  - `skills`: the seed checks each name. No task run reads the pin (open: skills key).
- **Check:**
  - `bun test modules/definitions/src/parse-task-definition.test.ts` (creates): the seed refuses
    each of faults 1 to 4 and 6 to 10; it refuses a `role` key and a `log` trigger as unknown keys;
    each refusal holds the file's path. The test asserts no sentence (open: refusal text).
  - The same file: the definition hash differs after an edit of `instructions.md`, and is the same
    after an added comment in `task.yaml`.
  - `bun test modules/definitions/src/is-definitions-path.test.ts`: `tasks/a/task.yaml`,
    `tasks/a/instructions.md` and `tasks/a/step.ts` pass; `tasks/a/notes.json` fails.
  - `bun test modules/definitions/src/build-definitions-snapshot.test.ts`: a manifest at format 3
    loads no task and lists each `tasks/` file as unapplied; a manifest at format 4 loads each task
    into the sorted `tasks` list.
- **Milestone:** 3.
- **Rollback:** the release before reads formats 2 and 3. It refuses a manifest at format 4, and its
  last seed is in force. It skips `tasks/` as an unknown root entry. It writes `jobs: []` into the
  snapshot form, so it computes another snapshot hash for the same files. It never reads
  `task_definition_versions`. Every deployment computes one fresh snapshot hash at the upgrade.

### definitions-2. The task of a definition

[The task definitions issue](https://linear.app/zgeoff/issue/GEO-1834).

- **Outcome:** Each `target: task` definition has one task, bound by `task.definition_set`. The
  claim opens task runs through `pickRunDefinition`, and each code path of a started task handles a
  definition's task.
- **Follows:** [the task of a definition](../definition-tasks.md), every design section.
  [Task runs of a definition](../definition-task-runs.md), "The 2 records of a fire", "What opens a
  task run" and "What nixie decides for a fire". `sketches/definitions/02-types.ts`, sections E and
  F. `sketches/definitions/03-flow.ts`, sections A to D.
- **Work:**
  - The record kinds `task.definition_set`, `trigger.fired` and `trigger.skipped`, and
    `trigger.fired` in `isInboxRecord`.
  - One appended migration: `definition_id` and `definition_hash` on the `tasks` projection, with
    the unique index.
  - The seed hook, the binding writer, `pickRunDefinition`, the reader
    `readDefinitionTaskInTransaction` and `readDefinitionTaskIDs`.
  - `readDefinitionVersion` and `readDefinitionRunPolicy`, passed into the tasks context.
  - The change to each code path in "How the built task code handles a definition's task".
- **Needs:** definitions-1, tasks-3, tasks-8. tasks-3 gives `task.run_opened`, `readRunState` and
  `origin.kind`, and it edits the same claim code first. tasks-8 gives the `definition` member of
  `readTaskSetup`. Blocked by the open items "hook context" and "claim order". The read of the
  recovery hold waits for operations-13, a slice of milestone 4 in
  [backup and recovery](../backup-and-recovery.md). Until then the reader does not read the hold,
  and no slice adds that read (open: recovery hold fire).
- **Check:** each test fires a trigger by writing a `trigger.fired` record. No trigger source exists
  in this slice.
  - `bun test modules/tasks/src/pick-run-definition.test.ts` (creates): each of the 4 results.
  - `bun test modules/tasks/src/write-definition-tasks.test.ts` (creates): a first seed creates one
    task and one binding; a second seed with the same list writes no record; a second task for one
    definition fails the unique index; a definition absent from the list gets a null hash.
  - `bun test modules/tasks/src/read-definition-task.test.ts` (creates): `take` for a waiting task;
    `still_running` with one fire unread; `held` for a failed task until a restart.
  - `bun test modules/tasks/src/claim-task.test.ts`: a claim of a written fire opens a task run with
    `origin.kind` `trigger` that pins the fire's hash; a claim after a server start with no unread
    input rests and calls no runner; a definition without `model` uses the profile of the `task`
    role; a `fresh` definition opens a session of its own at each task run, and a `continuing` one
    resumes the last.
  - `bun test apps/server/src/run-unknown-task-step.test.ts`: `runUnknownTaskStep` rejects a task
    with no starter. A spawned nixie cannot show the rollback failure, because the test build swaps
    in a test step.
- **Milestone:** 3.
- **Rollback:** the tasks projection of the release before skips `task.definition_set`. It holds a
  waiting task with no starter that none of its code wakes, revives or lists. It never selects the 2
  columns. It does not accept the inbox kind `trigger.fired`, so a fire wakes no task there. A
  definition's task that is `ready` or `running` at a rollback goes to that release's other claim
  pool. `runUnknownTaskStep` rejects it, so the task is `failed` after 3 step errors. After the
  upgrade, every fire of that definition skips with `task_held` until you restart the task, and the
  trigger report shows the skips. So roll back while no definition's task is `ready` or `running`,
  or restart each failed task after the upgrade.

### definitions-3. The `trigger` block and the reminder

[The task definitions issue](https://linear.app/zgeoff/issue/GEO-1834).

- **Outcome:** The first input of a task run that a fire opened holds the `trigger` block. A fire
  for a `target: conversation` definition reaches the conversation as a `reminder` message.
- **Follows:** [task runs of a definition](../definition-task-runs.md), "The `trigger` block" and
  "The reminder in the conversation". `sketches/definitions/02-types.ts`, section G.
- **Work:** the render of the `trigger` block, which `renderRunBlocks` calls; the `reminder` message
  type in the wire lib; its render in the web client.
- **Needs:** definitions-2, tasks-2, tasks-3. tasks-2 gives the envelope of a notice from nixie, and
  tasks-3 gives `renderRunBlocks`. The time wording of the reminder is not written (open: notice
  text): the check asserts the brief and the scheduled time as values, and no sentence.
- **Check:**
  - `bun test modules/tasks/src/render-trigger-block.test.ts` (creates): the block of a catch-up
    fire holds the scheduled time, the start time and the skipped times in the schedule's zone; a
    task run that a message opened has no block.
  - `bun test integration/definition-task-run.test.ts` (creates): a task run of a definition calls
    only the definition's tools and starts untrusted; a `trigger.fired` record on the conversation's
    thread wakes the conversation once with a `reminder` message.
- **Milestone:** 3.
- **Rollback:** how the web client of the release before shows `trigger.fired` on the conversation's
  thread is not checked (open: old client trigger.fired).

### definitions-4. The docs say "task definition"

[The task definitions issue](https://linear.app/zgeoff/issue/GEO-1834).

- **Outcome:** The glossary and 2 architecture docs use "task definition" and "task run of a
  definition" where they say "job" and "job run".
- **Follows:** the terms in [task definitions](../task-definitions.md).
- **Work:** the glossary rows "job", "job run", "trigger" and "definitions". The decision point's
  architecture doc, where it has "the job's list for a job run". The definitions architecture doc,
  where it lists the folders: `tasks` in place of `jobs`, and `prompts` added. The rule format's
  names are not part of this slice.
- **Needs:** definitions-1.
- **Check:** by hand on the pull request branch, in no CI lane:
  `git grep -n -w -i -E "jobs?" -- docs/glossary.md docs/architecture/core/definitions.md docs/architecture/policy/decision-point.md`
  prints no line. The command prints 9 lines on the branch point.
- **Milestone:** no deploy.

### definitions-5. The trigger core

[The schedules issue](https://linear.app/zgeoff/issue/GEO-1835).

- **Outcome:** The triggers module holds the `TriggerSource` port, `trigger.armed`,
  `trigger.delivered`, the 3 projections, `deliver`, the arming hook and `readNextFire`.
- **Follows:** [the trigger core](../trigger-core.md), every design section.
  [Schedules](../schedules-and-triggers.md), "The keys of a schedule", "Fire times" and "Dedupe
  keys". `sketches/definitions/02-types.ts`, sections B and H. `sketches/definitions/03-flow.ts`,
  sections E and F.
- **Work:** the module; the 2 record kinds; one appended migration for `trigger_sources`,
  `trigger_keys` and `trigger_definitions`; the seed's check of each schedule key; the call of the
  arming hook from both seed paths.
- **Needs:** definitions-1, definitions-2. The check (open: triggers imports) decides whether the
  server app passes the hook in. Between definitions-2 and this slice, a seed binds each task and
  arms none.
- **Check:** `bun test modules/triggers/src/deliver-trigger-batch.test.ts` (creates). Each test
  calls `deliverTriggerBatch` with events it builds. No source exists in this slice.
  - A second call with one dedupe key for a `target: conversation` definition writes no record and
    wakes no task.
  - A fire for a paused task writes `trigger.skipped` with `task_held`. The next slot after a resume
    writes `trigger.fired`.
  - A wakeable definition has an idle task run and one unread fire. The next 3 slots each write
    `trigger.skipped` with `still_running`, and the task holds one unread fire.
  - An event with no `definitionID` throws, and the transaction commits no record.
  - A fire for a task under a recovery hold is not a gate (open: recovery hold fire).
- **Milestone:** 3.
- **Rollback:** the release before folds `trigger.armed` and `trigger.delivered` into no table. It
  never calls the arming hook and never reads the 3 tables. The first seed or start after the
  upgrade repairs the rows.

### definitions-6. The schedule source and the one-shot

[The schedules issue](https://linear.app/zgeoff/issue/GEO-1835).

- **Outcome:** `schedule` and `at` triggers fire on time. After downtime each catches up or skips. A
  spent one-shot goes out of force.
- **Follows:** [schedules](../schedules-and-triggers.md), "The schedule source" to "A spent
  one-shot". `sketches/definitions/03-flow.ts`, sections G and H.
- **Work:** the schedule source; `isSpentOneShot`; `retireOneShot` for a one-shot from the repo; the
  start and stop of the source in the server app; `readDefinitionTask` and `retireOneShot` passed
  into the core.
- **Needs:** definitions-5. Blocked by the open item "retireOneShot order": this slice writes no
  `definition.settled` record, and definitions-9 adds that write.
- **Check:**
  - `bun test modules/triggers/src/read-next-fire.test.ts` (creates): a spring gap and an autumn
    repeat for a `day` schedule give one fire each day; an `hour` schedule gives 23 and 25 fires; a
    zone change between 2 fires of a `day` schedule gives one fire per local date; a minutes
    schedule gives the same fire times after a restart.
  - `bun test modules/triggers/src/schedule-source.test.ts` (creates): a catch-up within half the
    interval; a skip with `too_late` beyond it; `catchUp: skip`; a catch-up after downtime across a
    daylight-saving change fires each local slot once; a window with `idleMinutes` fires when the
    conversation goes idle, and skips with `window_closed` when it never does.
  - The same file, one test per trace of a one-shot from the repo: it fires once across a restart;
    first seeded after its time, it fires as a catch-up; fired, disabled and enabled again, it does
    not fire a second time; with its `at` edited away and back after a fire, it is out of force and
    the source builds no event; skipped under each of `still_running` and `task_held`, it is out of
    force (open: one-shot too late); in a restored backup that holds its key, it does not fire.
  - `bun run test:e2e`, a suite under `e2e/` that the slice creates: a definition on
    `{ minutes: 5 }` with a scripted model fires after `harness.advance(300_000)`, and its report
    reaches the conversation as a task message.
  - `bun run test:e2e`, a crash suite that the slice creates: a kill at the fault point before the
    `deliver` commit, then a restart, gives exactly one `trigger.fired` record for the batch. A kill
    at the fault point after the commit gives the same. A kill between the commit and the claim
    gives exactly one `task.run_opened` record with `origin.kind` `trigger`.
- **Milestone:** 3.

### definitions-7. The preview definition

[The schedules issue](https://linear.app/zgeoff/issue/GEO-1835).

- **Outcome:** The preview stack holds one scheduled definition and a manifest at format 4.
- **Follows:** [schedules](../schedules-and-triggers.md), "The schedule source".
- **Work:** `preview/definitions/tasks/preview-tick/task.yaml`, a definition on `{ minutes: 5 }`
  with `report: wake`; `preview/definitions/nixie.yaml` at format 4.
- **Needs:** definitions-6.
- **Check:** from `preview/`, run `NIXIE_PREVIEW_BIND=127.0.0.1 docker compose up --build --wait`.
  Do steps 1 to 3 of the [preview API check](../../../runbooks/preview-api-check.md). Wait 6
  minutes. Do step 5 of that check. Expect a `task_message` record of kind `report` from the
  definition's task on the conversation's thread. The clock and the model are real.
- **Milestone:** 3.

### definitions-8. The rule format names

[The task definitions issue](https://linear.app/zgeoff/issue/GEO-1834).

- **Outcome:** Not stated until the open item is decided.
- **Follows:** no doc. The rule format's `jobs` field and `job` context are as built.
- **Work:** none until the open item is decided.
- **Needs:** nothing. Blocked by the open item "rule format rename".
- **Check:** none. This slice is not a gate for any other slice.
- **Milestone:** 3.
