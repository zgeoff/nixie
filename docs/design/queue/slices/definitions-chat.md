# Task definitions: slices 9 to 16

The chat, view and example work of the task definitions design, in dependency order. Slices 1 to 8
are in [the definition slices](definitions.md). The open items are in
[the definitions open list](../open/definitions.md). The split is a first draft (open: pull request
split). A test file marked "(creates)" does not exist: the slice creates it. Slice numbers of the
tasks family are those of [the task slices](tasks.md) and
[the wake and grant slices](tasks-wake-and-grant.md).

Slices 9 to 11 are one piece of work. Slices 12 and 13 can land beside them. Slices 14 to 16 are the
examples.

Each slice has the ID `definitions-<n>`, which is unique across the queue, and each "Needs" names a
slice by its ID. In any other field of this file, "slice n" means `definitions-n`.
[The work list](../work-list.md) gives the build order.

### definitions-9. The runtime layer

[The definitions from chat issue](https://linear.app/zgeoff/issue/GEO-1836).

- **Outcome:** nixie holds runtime changes of task definitions over the repo. A seed adopts a change
  or finds a conflict, and you resolve a conflict from the command line.
- **Follows:** [definitions from chat](../definitions-from-chat.md), "The change records", "The
  runtime layer" and "One runtime change, in one write transaction".
  [Undo and the export](../definition-undo-and-export.md), "The undo procedure", "What an undo
  does", "Adoption and conflict" and "Unreadable runtime definitions".
  `sketches/definitions/02-types.ts`, sections J to L. `sketches/definitions/03-flow.ts`, sections
  H, I, J and L.
- **Work:** the 5 record kinds; one appended migration for `runtime_task_definitions` and
  `task_definition_exports`; `pickDefinitionMove`; `buildTaskSeedPlan`; `seedInForceInTransaction`;
  `retireOneShotInTransaction` with its `definition.settled` write, passed to the triggers module in
  place of the `retireOneShot` of slice 6; the conflict command.
- **Needs:** definitions-1 to definitions-6. `buildRuntimeOverlay`, the runtime overlay of the rules
  core, is built. Blocked by the open items "undefined types", "decider clock" and "resolve
  command". The check (open: erase of a change) follows this slice and is not a gate.
- **Check:**
  - `bun test modules/definitions/src/pick-definition-move.test.ts` (creates): each of the 7 rows of
    the undo; an undo of a change that replaced a definition puts the version before it in force; an
    undo of an added definition puts the definition out of force; an undo of a replaced change is
    refused and returns the head.
  - `bun test modules/definitions/src/build-task-seed-plan.test.ts` (creates): a seed adopts a
    runtime definition when the repo holds its hash; the plan holds a conflict when the repo holds
    another version.
  - `bun test modules/definitions/src/request-definition-change.test.ts` (creates): a change and an
    undo made while a fire of the definition is written and unread do not alter the hash that the
    fire pinned. The test writes the `trigger.fired` record of slice 2.
  - `bun test modules/triggers/src/schedule-source.test.ts`: a runtime one-shot skipped under each
    of `still_running` and `task_held` has a `definition.settled` record with the cause
    `one_shot_skipped` (open: one-shot too late).
- **Milestone:** 3.
- **Rollback:** the release before stores and replays the 5 record kinds and folds none of them. It
  never reads the 2 tables. Its seed has no runtime layer. So under it a runtime definition does not
  fire, and a definition that chat deleted and the repo holds fires again. The rows are intact, and
  the first seed after the upgrade arms them again. A runtime one-shot that falls due under that
  release never fires.

### definitions-10. The chat tools, the notice and the undo

[The definitions from chat issue](https://linear.app/zgeoff/issue/GEO-1836).

- **Outcome:** The conversation holds `task.define`, `tasks.definitions` and `task.undefine`. Each
  change shows as a notice, and `definitions.undo` reverses one.
- **Follows:** [definitions from chat](../definitions-from-chat.md), "The 3 tools", "What
  `task.define` accepts" and "The rendered schedule".
  [Undo and the export](../definition-undo-and-export.md), "The undo procedure" and "What an undo
  does". `sketches/definitions/02-types.ts`, sections I and M. `sketches/definitions/01-usage.ts`,
  sections E and F.
- **Work:** the 3 tools; the fixed rule in `getFixedRules`; the rendering function;
  `requestDefinitionChange`; the render of `definition.changed` in the web client;
  `undoDefinitionChange` and the procedure `definitions.undo` in the contract lib.
- **Needs:** definitions-9. Blocked by the open items "notice text", "undo output" and "ID casing".
  The refusal sentences are not written (open: refusal text): each check asserts a code.
- **Check:**
  - `bun test modules/triggers/src/render-trigger.test.ts` (creates): a property test over random
    schedules. The rendered schedule and the next fire match the stored trigger across a
    daylight-saving change.
  - `bun test modules/policy/src/get-fixed-rules.test.ts`: the fixed rule for `task.define` and
    `task.undefine` is tried before `slice1.read-only`.
  - `bun test integration/define-from-chat.test.ts` (creates): `task.define` from the conversation
    with `target: conversation` puts the definition in force and writes the notice, and the schedule
    source fires it under an advanced clock. A one-shot from chat and a one-shot from files are each
    out of force after their fire. The task of the `target: task` one has a null hash, and a seed
    after the fire omits each.
- **Milestone:** 3.
- **Rollback:** how the web client of the release before shows `definition.changed` is not checked
  (open: old client definition.changed).

### definitions-11. The export

[The definitions from chat issue](https://linear.app/zgeoff/issue/GEO-1836).

- **Outcome:** The definitions export mirrors each exported runtime change into one rolling pull
  request on the branch `nixie/tasks`.
- **Follows:** [undo and the export](../definition-undo-and-export.md), "The export", "The export
  ID" and "What an export writes". `sketches/definitions/03-flow.ts`, section K.
- **Work:** `buildTaskChangeKind`, `isExportedDefinition`, and the registration of the change kind
  in the server app.
- **Needs:** definitions-9.
- **Check:** `bun test modules/definitions/src/build-task-change-kind.test.ts` (creates): the export
  holds no one-shot; a deleted definition deletes every file of its folder; a repo under format 4
  fails the export and opens no pull request.
- **Milestone:** 3.

### definitions-12. The view procedures

[The live view issue](https://linear.app/zgeoff/issue/GEO-1837).

- **Outcome:** The API serves `tasks.listFinished`, `triggers.report` and `definitions.listTasks`.
- **Follows:** [the definition views](../definition-views.md), "The 3 procedures" to "The list of
  definitions". `sketches/definitions/02-types.ts`, section M.
- **Work:** the 3 procedures in the contract lib; their reads in the triggers module and the
  definitions module; their handlers in the API module.
- **Needs:** definitions-1 to definitions-6, tasks-3. tasks-3 gives `readFinishedRuns` and
  `FinishedRun`. Blocked by the open items "undefined types", for `listedTask`, "ended task runs
  name" and "view details". Without definitions-9, `createdBy` is null for a runtime definition, and
  no runtime definition exists.
- **Check:** `bun test modules/api/src/create-view-procedures.test.ts` (creates): `triggers.report`
  holds a skipped fire and a late catch-up; `tasks.listFinished` pages through 101 ended task runs
  in 2 pages; `definitions.listTasks` holds a spent one-shot from the repo with `next: null`.
- **Milestone:** 3.
- **Rollback:** the release before does not hold the 3 procedures and never calls them.

### definitions-13. The view routes

[The live view issue](https://linear.app/zgeoff/issue/GEO-1837).

- **Outcome:** The web client has `/tasks/finished`, with the trigger report, and `/definitions`.
- **Follows:** [the definition views](../definition-views.md), "The web client".
- **Work:** the 2 routes, and the follow of the 3 record kinds.
- **Needs:** definitions-10, definitions-12. definitions-10 gives `task.define` for the journey and
  the preview check. Blocked by the open item "view details".
- **Check:**
  - `bun run test:browser`, in test files that the slice creates beside the 2 routes: an ended task
    run opens with its records, and each line offers its raw record; `/definitions` lists a
    definition with its rendered trigger and its next fire.
  - `bun run test:journeys`, a journey that the slice creates: a definition made through
    `task.define` in a scripted turn shows in the list with the record that created it.
  - The preview stack: from `preview/`, run
    `NIXIE_PREVIEW_BIND=127.0.0.1 docker compose up --build --wait`. Do steps 1 to 6 of the
    [preview API check](../../../runbooks/preview-api-check.md) with the message text "Remind me
    every Friday at 08:00 to water the tomatoes." Expect a `definition.changed` record on the
    conversation's thread in the page that step 5 reads. Open `http://127.0.0.1:8080/definitions`.
    Expect the definition with its rendered trigger, its next fire and the record that created it.
    With slice 7 in the build, expect the task run of `preview-tick` at
    `http://127.0.0.1:8080/tasks/finished`. The model turn is real, and it uses the preview's own
    database.
- **Milestone:** 3.

### definitions-14. The note-taking example

[The note-taking example issue](https://linear.app/zgeoff/issue/GEO-1849).

- **Outcome:** The guides hold the note-taking `task.yaml`, its `instructions.md` and its guide
  page. One test runs the definition.
- **Follows:** [the example definitions](../example-definitions.md), "What every example shares" and
  "Note-taking". [The example files](../sketches/definitions/examples.md), section A.
- **Work:** the 2 files, the guide page and the 2 tests.
- **Needs:** definitions-1 to definitions-6, tasks-3, tasks-6, tasks-7, memory-gate-2,
  memory-gate-3, memory-gate-5, memory-gate-7. tasks-3 gives `task.report`, tasks-6 the `log` grant,
  and tasks-7 the start time of the previous task run. memory-gate-5 gives the task write tools of
  [memory tools on a task](../memory-task-tools.md). memory-gate-2 and memory-gate-3 are
  [the delete of the built-in memory tasks](../memory-task-delete.md). memory-gate-7 gives the save
  from a message that a granted task cites. Blocked by the open items "previous start time", "gate
  quote thread" and "example instructions text".
- **Check:**
  - `bun test modules/definitions/src/example-definitions.test.ts` (creates): the seed accepts the 2
    files of the folder.
  - `bun run test:e2e`, a suite that the slice creates: the task run in the doc section. The
    assertion on the save rests on "gate quote thread" and is not a gate until that item is decided.
- **Milestone:** 3. No migration and no deploy step.

### definitions-15. The memory consolidation example

[The consolidation example issue](https://linear.app/zgeoff/issue/GEO-2114).

- **Outcome:** The guides hold the consolidation `task.yaml`, its `instructions.md` and its guide
  page. One test runs the definition.
- **Follows:** [the example definitions](../example-definitions.md), "What every example shares" and
  "Memory consolidation". [The example files](../sketches/definitions/examples.md), section B.
- **Work:** the 2 files, the guide page and the 2 tests.
- **Needs:** definitions-1 to definitions-6, tasks-3, memory-gate-2, memory-gate-3, memory-gate-5.
  memory-gate-5 gives the task write tools of [memory tools on a task](../memory-task-tools.md).
  memory-gate-2 and memory-gate-3 are
  [the delete of the built-in memory tasks](../memory-task-delete.md). Blocked by the open item
  "example instructions text".
- **Check:**
  - `bun test modules/definitions/src/example-definitions.test.ts`: the seed accepts the 2 files of
    the folder. The first of slices 14 and 15 to land creates the file.
  - `bun run test:e2e`, a suite that the slice creates: the task run in the doc section.
- **Milestone:** 3. No migration and no deploy step.

### definitions-16. The moment reflection example

[The moment reflection issue](https://linear.app/zgeoff/issue/GEO-1334).

- **Outcome:** The guides hold the moment reflection `task.yaml` and its `instructions.md`. One test
  runs the definition.
- **Follows:** [the example definitions](../example-definitions.md), "What every example shares" and
  "Moment reflection". [The example files](../sketches/definitions/examples.md), section C.
- **Work:** the 2 files and the test.
- **Needs:** definitions-1 to definitions-6, tasks-3, tasks-6, memory-gate-5. tasks-3 gives
  `task.report` and `maxCalls`, and tasks-6 the `log` grant. memory-gate-5 gives the task write
  tools of [memory tools on a task](../memory-task-tools.md). Blocked by the open item "example
  instructions text". The item (open: moment guide page) decides whether a guide page is part of the
  work.
- **Check:** `bun run test:e2e`, a suite that the slice creates: the task run in the doc section.
- **Milestone:** 3. No migration and no deploy step.
