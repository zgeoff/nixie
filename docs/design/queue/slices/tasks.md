# Tasks: the work as slices

Slices 1 to 4 are here, in dependency order. Slices 5 to 7 are in
[the wake and grant slices](tasks-wake-and-grant.md), and slices 8 to 10 are in
[the worker slices](tasks-worker.md). Open items are in [the open list](../open/tasks.md); a check
that rests on one is marked and is not a gate. "Definitions slice n" is a slice of
[the definitions slices](definitions.md).

Run `bun run models && bun run test:bundles` once before the unit tests of a slice. Tests are in the
unit lane unless marked. "Creates" marks a test file that the slice adds.

Each slice has the ID `tasks-<n>`, which is unique across the queue, and each "Needs" names a slice
by its ID. In any other field of this file, "slice n" means `tasks-n`.
[The work list](../work-list.md) gives the build order.

### tasks-1. A turn's budget counts late spend

[The late spend issue](https://linear.app/zgeoff/issue/GEO-2495).

- **Outcome:** A turn stops at the task's dollar limit when a step whose lease expired records its
  spend after the turn started.
- **Follows:** "Late spend in a turn's budget" in [task run limits](../task-run-limits.md);
  `03-flow.ts`, section F.
- **Work:** `readTaskUsage` also returns the sequence at which its read ended. `createCallBudget`
  takes a reader of late spend, and its `onCall` returns a promise that the call hook awaits. Remove
  from `docs/architecture/core/started-tasks.md` the sentence that a task can pass its dollar limit
  by up to one turn's spend.
- **Needs:** nothing. It lands at any time.
- **Check:**
  - `bun test modules/sessions/src/start-nixie-runner.test.ts`: change the test "it pauses a task
    turn at its dollar limit with the counts that include a spend recorded while the turn ran". A
    turn with $0.03 left meets a $0.01 spend record after its first priced call, is interrupted when
    its own calls reach $0.02, and the limit notice shows $0.03 used.
  - `git grep -n "by up to one turn's spend" -- docs/architecture/core/started-tasks.md` prints
    nothing.
- **Milestone:** 1.

### tasks-2. The brief and the envelope

[The brief and envelope issue](https://linear.app/zgeoff/issue/GEO-2357).

- **Outcome:** A started task gets the frame's first 2 paragraphs, its brief as a request in the
  shared envelope, `<owner-message>` for a message from you, and the notice rules. A start writes
  the brief record, and you can forget a brief.
- **Follows:** [task messages](../task-messages.md); [the task brief](../task-brief.md), without the
  rules for a definition's task run and a carried task run; `02-types.ts`, sections H, I and J;
  `03-flow.ts`, sections G and H.
- **Work:**
  - `writeTaskStart` takes the hop limit and writes the brief record. `task.created` stops carrying
    `brief`.
  - Delete `renderTaskStartNote`, `pickStartNote` and the type `task-start`.
  - `docs/architecture/core/conversation-turns.md` describes the envelope and drops the sentence
    that the envelope gives the sender's name and the hop.
  - It changes a prompt and memory delivery, so it waits for your review.
- **Needs:** nothing. Blocked by the open items "label task ID" and "undefined task types". It lands
  before tasks-3. Between the 2, the frame has 2 paragraphs and a task reports through
  `task.message`, as built. (open: task slice order)
- **Check:**
  - `bun test modules/sessions/src/read-turn-context.test.ts`: the first turn renders `status`, the
    memory blocks under `memory: read`, then the brief as a request, with no `task-start` block;
    `memory: none` with `persona: default` renders no memory block.
  - `bun test modules/sessions/src/render-task-message.test.ts` and
    `bun test modules/sessions/src/render-history-line.test.ts`: the 6 attributes in order;
    `on-behalf-of` after `sent` on a message that passes on messages from you; no `hop`,
    `reply-wakes`, `age` or `name`; no "from another task" line. The label cases rest on the open
    item "label task ID" and are not a gate.
  - `bun test modules/sessions/src/render-inbox-message.test.ts`: a message from you renders in
    `<owner-message>`; a task message does not; a limit notice renders in `<system-message>` with
    the type `task-limit`; a body with the text `</system-message` in a quoted block does not close
    the element.
  - `bun test modules/sessions/src/start-nixie-runner.test.ts`: text that a task writes with no
    `task.message` call reaches no channel and no other thread.
  - `bun test modules/tasks/src/write-task-start.test.ts` (creates): a start writes `task.created`
    with `briefMessageID` and one brief record in one transaction; a rerun writes neither; a throw
    while writing the brief record leaves no task.
  - `bun test modules/sessions/src/read-session-opening.test.ts`: rows 2 to 4 of the table of where
    the brief renders; a `task.created` record with `brief` and no `briefMessageID` gives the brief
    in the last block of the preamble; a session whose `model.session_opened` record has no
    `briefSequence` rebuilds once with the brief pinned.
  - `bun test modules/api/src/write-forget-start.test.ts` (creates): the forget of a brief destroys
    the key of the brief record and the key of the starter's `tool_called` record, and both sessions
    rebuild.
  - Preview, by the preview API check runbook: one started task's first input, pasted in the pull
    request, shows the envelope and no `task-start` block. Record beside it whether the harness
    reminders are present; that result is not a gate. (open: harness reminders)
  - Not a gate: a read-only read of production of the `memory` option on the creation record of the
    task that got pinned memory. (open: pinned memory task)
  - Run first: (open: batch cut wake), (open: forget session cleanup).
- **Records of a previous release:**
  - A task whose `task.created` record has no `briefMessageID` has no brief record. `readTaskBrief`
    reads the erasable `brief` of its `task.created` record, with the task's own ID as the message
    ID (the brief origin `created` in `02-types.ts`, section I). That brief renders last in the
    preamble, and pinned in a rebuilt session.
  - A reply to that brief is accepted when `replyTo` is the sender's own task ID, the sender has no
    `briefMessageID`, and `to` is the sender's starter.
  - When the newest `model.session_opened` record of a session has no `briefSequence` key,
    `hasOpening` of `readSessionMarks` is false and `pickSessionPosition` returns `lost`. The next
    step rebuilds the session once, with the brief pinned. The session key is the same, so nixie
    does not treat that step as the first step of a session.
  - A session that a previous release opened shows the previous envelope until it closes.
  - Write no brief record at server start for a task that has none. The task would read its brief a
    second time as unread input.
- **Rollback:** no migration. The previous release drops `briefMessageID` and `briefSequence` on
  decode. For a task that this release started, its system prompt shows "Your brief:" with nothing
  under it, and its task list shows an empty brief. A task that never ran gets the start note and
  then the brief once, as a task message in the previous envelope. Its projection reads
  `opensWait: false`. A rebuilt session drops the brief when a summary or the token limit passes it.
- **Milestone:** 3. No test turn goes to production.

### tasks-3. Task run records and `task.report`

[The task report issue](https://linear.app/zgeoff/issue/GEO-2113).

- **Outcome:** Every task run of a started task opens and ends with a record and ends in one report.
  A task reports through `task.report`, a start declares a report shape, the tools module enforces a
  call cap, `log.read` shows task messages, and you can forget a report.
- **Follows:** [task runs](../task-runs-and-reports.md), without the start time of the previous task
  run; [the delivery of a report](../task-report-delivery.md); "Meters and limits", "A raise and the
  carried task run" and "Call caps" in [task run limits](../task-run-limits.md);
  [the report shape](../task-report-shape.md); `02-types.ts`, sections A to G; `03-flow.ts`,
  sections A to E.
- **Work, as 3 commits:**
  1. The rename, with no change of behaviour: `startRunnerPool`, `RunnerPool` and
     `RunnerPoolOptions` to `startClaimPool`, `ClaimPool` and `ClaimPoolOptions`, in
     `start-claim-pool.ts`; `startTaskRunners` to `startTaskClaimPools` (open: rename file); the
     imports in `start-action-runners` of the actions module. Remove "runner pool", and "runner" for
     a lease holder, from the docs, with the `#runner-pools` anchors. The config key `tasks.runners`
     has the same name after the rename, because the config schema is strict.
  2. The 3 kinds, the `task_runs` migration, the readers, the meters and the writer of an end. The
     nixie runner returns its reached limit in `StepResult.run`, and both of its calls of
     `writeTaskLimitPause` go. (open: limit pause move)
  3. `task.report`, the report shape, `renderRunBlocks` with the `report-shape` block, the role
     `task` in `log.read`, the forget of a report and the call cap.
  - `docs/glossary.md`, `docs/architecture/core/tasks.md` and
    `docs/architecture/core/started-tasks.md` define a task run, a report and a report shape.
- **Needs:** tasks-2. It gives the brief record of the `pending` check. Blocked by the open items
  "code-made report ID", "undefined task types", "raise limits pin" and "finished target".
  operations-13, the recovery hold of [backup and recovery](../backup-and-recovery.md), edits the
  same claim code in milestone 4 and rebases on this slice.
- **Check:** every check uses started tasks only. The checks with a `trigger.fired` record, the
  `trigger` block or a definition are in definitions slices 2 and 3.
  - `bun test modules/tasks/src/build-task-report-tool.test.ts` (creates): one report with the
    summary and the fields; `wake` follows each of the 3 modes; a second call is refused; a call
    whose fields do not match gets the refusal, writes no `task.run_report_requested` record and
    ends nothing, and the next matching call sends the report; a task with no shape reports with a
    summary alone and refuses a call with fields; the `tool_called` record of every call has an
    empty input.
  - `bun test modules/tasks/src/check-report-shape.test.ts` (creates): each fault gets its sentence;
    a shape with every keyword of the table is accepted; 2 shapes that differ only in key order give
    the same stored value.
  - `bun test modules/tasks/src/plan-task-start.test.ts`: a start whose shape has a keyword outside
    the table is refused with `report_shape`.
  - `bun test modules/tasks/src/write-task-run-end.test.ts` (creates): a task run stopped at its
    limit sends one report with the `limit` summary, and with `missing` when the task declares a
    shape; each row of the table of ends gives its cause and next state; under `none` the delivery
    is `kept` and the log has no `task_message` for the report. The case of a report target that has
    finished rests on the open item "finished target" and is not a gate.
  - `bun test modules/tasks/src/pick-record-run.test.ts` (creates): a `tool_result` that a stale
    step writes after a stop and a restart belongs to the task run that made it, and it does not end
    the next task run.
  - `bun test modules/tasks/src/task-runs-projection.test.ts` (creates): a rerun of the first step
    opens no second task run; a rebuild of the projection gives the same rows; a raise after a
    `limit` end opens one task run with `carriesRunID` set and the `reportShape` copied, and a
    second claim opens none; `readRunState` returns `pending` for an unread brief with no open task
    run.
  - `bun test modules/sessions/src/render-run-blocks.test.ts` (creates): a rerun of the first step
    and a rebuilt session render the same `report-shape` block; a task run with no shape renders
    none.
  - `bun test modules/memory/src/read-log-page.test.ts`: a delivered report is an entry of the role
    `task` whose text contains the fields, and its text is null after the forget.
  - `bun test modules/api/src/write-forget-start.test.ts`: the forget of a report destroys the keys
    of its 3 records.
  - `bun test modules/tools/src/run-tool-call.test.ts`: with a task run stub whose `maxCalls` is
    `{ 'moment.edit': 3 }`, the 4th call gets the cap refusal and the tool does not run; an errored
    call does not count.
  - `bun test modules/sessions/src/start-nixie-runner.test.ts`: a task at its limit has one
    `task.limit_reached` record per limit end.
  - `bun run test:e2e` (e2e lane, creates `e2e/crash/task-report.test.ts`): a step that crashes
    after an action ran and then reruns ends its task run with exactly one report.
  - `git grep -n -i "runner pool" -- docs/architecture docs/design/platform docs/glossary.md docs/README.md modules apps`
    prints nothing.
  - Run first: (open: newer log replay), (open: object arguments), (open: validator text).
- **Migration:** one appended migration adds `task_runs`. The compatibility job runs
  `bun run ci:compatibility:run-migration-check`.
- **Rollback:** the log has the 3 kinds, the `taskRunID` keys, tool records of `task.report`, the
  `task_runs` table and any open task run. The previous release drops `taskRunID` and
  `options.reportShape` on decode, runs the task with no shape and reports a summary alone. Its
  tasks projection ignores a kind that it cannot parse. It counts turns and dollars over the whole
  thread, so a limit comes sooner. It shows a report's body as text and shows no task message in
  `log.read`. It refuses a definition file with `reportShape` or `maxCalls`, so first remove both
  keys from every definition file.
- **Milestone:** 3.

### tasks-4. The brief of a definition's task run

[The brief and envelope issue](https://linear.app/zgeoff/issue/GEO-2357).

- **Outcome:** A definition's task run gets its brief from the version that it pins, with the
  `trigger` block and the `report-shape` block directly before it. A carried task run renders by the
  table. The frame has its third paragraph.
- **Follows:** "The readers of a brief", "The first message of a task run" and "Where the brief
  renders" in [the task brief](../task-brief.md); "The prompt frame" in
  [task messages](../task-messages.md); `03-flow.ts`, section H.
- **Needs:** tasks-2, tasks-3, definitions-2, definitions-3. definitions-2 gives the task of a
  definition, and definitions-3 gives the trigger records and the `trigger` block. Blocked by the
  open items "claim order", "briefID maker", "starter label" and "seed check order".
- **Check:** `bun test modules/sessions/src/read-session-opening.test.ts`: rows 1 and 5 of the table
  of where the brief renders; a definition's task run that a message opened under `fresh` opens with
  the brief of the version in force and then that message; a carried task run in a rebuilt session
  shows its pinned brief.
- **Milestone:** 3.
