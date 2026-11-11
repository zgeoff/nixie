# Tasks: the wake rule, the log grant and the previous start time as slices

Slices 5 to 7 follow slices 1 to 4 in [the task slices](tasks.md). Open items are in
[the open list](../open/tasks.md); a check that rests on one is marked and is not a gate.
"Definitions slice n" is a slice of [the definitions slices](definitions.md).

Run `bun run models && bun run test:bundles` once before the unit tests of a slice. Tests are in the
unit lane unless marked. "Creates" marks a test file that the slice adds.

Each slice has the ID `tasks-<n>`, which is unique across the queue, and each "Needs" names a slice
by its ID. In any other field of this file, "slice n" means `tasks-n`.
[The work list](../work-list.md) gives the build order.

### tasks-5. A message wakes a wakeable task

[The wake issue](https://linear.app/zgeoff/issue/GEO-1865).

- **Outcome:** A message starts a task run on a wakeable task that waits. An asleep task reads the
  message at its next task run, and `tasks.list` shows `wakeable`, `asleep` and `nextRunAt`.
- **Follows:** [waking a task](../task-wake.md); `02-types.ts`, section K; `03-flow.ts`, section I.
- **Work:** rename `TaskProfile.isWokenByMessages` to `wakeable`. The 2 hard-coded system rows go
  with the memory family's delete of the built-in memory tasks; until then both tasks are not
  wakeable. `docs/design/platform/core/tasks.md` and `docs/architecture/core/task-messages.md` state
  the rule.
- **Needs:** tasks-3, definitions-2, definitions-6. "No open task run" and the `finished` row read
  the `task_runs` of tasks-3. The case with a definition needs definitions-2, and the case with
  `nextRunAt` needs the schedule source of definitions-6. Every other test uses a task profile stub
  with `wakeable: false`.
- **Check:**
  - `bun test modules/tasks/src/plan-task-message.test.ts`: a message to a waiting wakeable task
    wakes it; a `question` to an asleep task starts nothing, opens no wait and returns the note; a
    chain stops at the hop limit.
  - `bun test modules/tasks/src/read-task-directory.test.ts`: a started task is wakeable.
  - `bun test modules/tasks/src/pick-listed-task-state.test.ts`: each row of the table of listed
    states.
  - `bun run ci:compatibility:run-contract-growth-check` passes.
  - With definitions-2 and definitions-6: an asleep scheduled task shows `nextRunAt`; in
    `bun test modules/sessions/src/start-nixie-runner.test.ts`, a wakeable definition's task starts
    a task run on a message, and its reply wakes the sender.
- **Milestone:** 3.

### tasks-6. The log grant

[The log grant issue](https://linear.app/zgeoff/issue/GEO-2525).

- **Outcome:** A start or a definition sets `log: conversation`, and the `log.read` of a granted
  task reads the conversation's thread.
- **Follows:** [the log grant](../task-log-grant.md); `02-types.ts`, section L.
- **Needs:** nothing. Blocked by the open items "retrieval and the grant" and "newer log replay".
  definitions-14, the note-taking example, also waits for "gate quote thread".
- **Check:**
  - `bun test modules/tasks/src/plan-task-start.test.ts`: the conversation starts a task with
    `log: conversation`; a task without the grant is refused with the sentence; a granted task
    passes the grant on; a start with no `log` key gets `own`.
  - `bun test modules/tasks/src/task-run-options-schema.test.ts` (creates): options stored with no
    `log` key decode as `own`.
  - `bun test modules/memory/src/build-log-read-tool.test.ts`: the tool reads `logThread`; a tool
    run whose `logThread` is the task's own thread returns no record of the conversation.
  - `bun test modules/sessions/src/start-nixie-runner.test.ts`: a granted task's `log.read` returns
    the conversation's records, and the 2 records of that call are on the task's own thread.
- **Rollback:** when the newer-log check passes, the previous release runs a granted task on its own
  thread, so a rollback only narrows.
- **Milestone:** 3. No test turn goes to production.

### tasks-7. The start time of the previous task run

No issue.

- **Outcome:** Every task run of a definition gets a block with the start of its previous task run,
  as a UTC time that ends in `Z`.
- **Follows:** "The start time of the previous task run" in
  [task runs](../task-runs-and-reports.md).
- **Needs:** tasks-3, definitions-2. tasks-3 gives `readPreviousRun` and `renderRunBlocks`. Blocked
  by the open items "previous start block", "carried start time" and "first enabled time".
- **Check:** a test of the block's renderer (creates; the file name follows the block's name): a
  task run with a previous task run shows that task run's start; the first task run of a definition
  shows the time the definition was first enabled.
  `bun test modules/memory/src/build-log-read-tool.test.ts`: `log.read` accepts the rendered time as
  `from`. Run first: (open: log.read edge).
- **Milestone:** 3.
