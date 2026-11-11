# Tasks: what is not settled

Each item is marked in a doc or a sketch as `(open: <name>)`. The slices are in
[the task slices](../slices/tasks.md),
[the wake and grant slices](../slices/tasks-wake-and-grant.md) and
[the worker slices](../slices/tasks-worker.md). The issues:
[the late spend issue](https://linear.app/zgeoff/issue/GEO-2495),
[the brief and envelope issue](https://linear.app/zgeoff/issue/GEO-2357),
[the task report issue](https://linear.app/zgeoff/issue/GEO-2113),
[the wake issue](https://linear.app/zgeoff/issue/GEO-1865),
[the log grant issue](https://linear.app/zgeoff/issue/GEO-2525),
[the runner port and worker issue](https://linear.app/zgeoff/issue/GEO-1793) and
[the end-to-end checks issue](https://linear.app/zgeoff/issue/GEO-1797). The start time of the
previous task run has no issue.

## Items that block a slice

Each item starts with its milestone and the slices that it blocks. An item blocks a slice when the
slice cannot be built or checked until the item is settled. [The open list](../open.md) holds every
blocking item of the queue.

- Slice 2: forget session cleanup; batch cut wake; undefined task types; label task ID.
- Slice 3: finished target; newer log replay; object arguments; validator text; code-made report ID;
  undefined task types; raise limits pin.
- Slice 4: claim order; seed check order; starter label; briefID maker.
- Slice 5: in part: nextRunAt source.
- Slice 6: newer log replay; retrieval and the grant.
- Slice 7: first enabled time (the definitions list); previous start block; carried start time;
  log.read edge.
- Slice 8: runner key (the definitions list).
- Slice 9: agent-sdk tool-call timeout (the harnesses list); newer log replay; rebuild replays by
  thread; undefined task types; worker config sentences.
- Definitions slice 2: claim order; definition task next state.
- Definitions slice 14: previous start block.

## Not decided

- **claim order.** Milestone 3. Blocks slice 4 and definitions slice 2. A claim with an unread fire
  and a restart after a failed task run has 2 flows. This family checks the raise or restart and the
  limit hold first. The definitions family asks `pickRunDefinition` first, with the fire before the
  carry. The 2 open different task runs.
- **finished target.** Milestone 3. Blocks slice 3. "A report whose target has finished is kept" has
  2 readings: the report target is closed or `done`, or the report target has the listed state
  `finished`. A `finished` task accepts messages. The docs state the rule and mark it.
- **previous start block.** Milestone 3. Blocks slice 7 and definitions slice 14. The name and the
  exact text of the block that gives the start of the previous task run. No option is stated.
- **carried start time.** Milestone 3. Blocks slice 7. Which start time a carried task run gets: the
  start of the task run it carries on, or the start of the task run before that one. No option is
  stated.
- **seed check order.** Milestone 3. Blocks slice 4. A definition's seed calls `checkReportShape`
  and the `maxCalls` check of this family, and this family's rules for a definition's task run call
  functions of the definitions family. Which family's slice lands first is not stated. The slices
  follow this order: slice 3 passes with started tasks only, and the definitions slices call its
  exports.
- **task slice order.** Milestone 3. Blocks no slice. The first-pass docs give no reason for the
  order of slice 2 against slice 3, or for the 3 commits of slice 3. The slices pick slice 2 first.

## Not checked

- **newer log replay.** Milestone 3. Blocks slices 3, 6 and 9. The last release reads a log with
  this family's records and keys. Slice 3 creates `modules/sessions/src/read-newer-log.test.ts`;
  slices 2, 6 and 9 add their records to it. Run it by hand in a git worktree at the last release's
  tag. Pass: each rollback note stands. Fail on a kind or key: that slice's rollback note takes a
  step that closes what fails.
- **object arguments.** Milestone 3. Blocks slice 3. Each model runtime passes a free-form object
  argument unchanged. Write one probe per harness and run
  `bun run test:agent-sdk guests/conversation/`; the Codex harness family owns the Codex probe.
  Unchanged: the design stands. Dropped: stop, and choose between `fields` as a JSON string and no
  report shape on that harness.
- **validator text.** Milestone 3. Blocks slice 3. The validator's error text contains no value of
  the input, and the validator skips an unknown keyword. Slice 3 creates
  `modules/tools/src/build-schema-parser.test.ts` with a marker string as every value. No marker in
  the text: the refusal uses the validator's text. A marker: `checkReportFields` builds the text
  from each error's path and keyword.
- **forget session cleanup.** Milestone 3. Blocks slice 2. A record forget invalidates a started
  task's session and its starter's. The first of slices 2 and 3 creates
  `modules/api/src/write-forget-start.test.ts` for it. Pass: the forgets only destroy their keys.
  Fail: each forget invalidates both sessions itself.
- **retrieval and the grant.** Milestone 3. Blocks slice 6. A task with `memory: read` gets no
  conversation message from the per-turn search. Slice 6 creates
  `modules/sessions/src/read-turn-retrieval.test.ts` for it. None returned: the grant is the only
  way. One returned: stop before the grant lands.
- "gate quote thread" is filed once, in [the memory gate list](memory-gate.md#known-faults).
- **log.read edge.** Milestone 3. Blocks slice 7. `to` and `from` at one time split a thread with no
  gap and no repeat. Add a 3-message test to `modules/memory/src/build-log-read-tool.test.ts`. Each
  message in exactly one result: a time is enough. Otherwise the design first states the side of the
  edge.
- **batch cut wake.** Milestone 3. Blocks slice 2. A step that leaves unread input behind the batch
  cut runs its next turn with no wake. Slice 2 creates
  `modules/sessions/src/read-session-turn.test.ts` for it. Pass: `pickTurnInbox` stands. Fail: the
  step that cut its batch commits the task as `ready`.
- **harness reminders.** Milestone 3. Blocks no slice. Whether the Agent SDK can drop the CLI's own
  reminders (environment, model, date). Read the SDK's docs or run a spike in `research/`, and
  record the result in the pull request. What the guest does with the result is not settled.
- "tool-call wait probe" is filed once, as "agent-sdk tool-call timeout" in
  [the harnesses list](harnesses.md#not-checked).
- **rebuild replays by thread.** Milestone 3. Blocks slice 9. A session rebuild replays
  `tool_called` by thread. Add a test to `modules/sessions/src/read-session-opening.test.ts` with a
  `tool_called` record under a foreign tool run ID. Replayed: slice 9 adds the skip. Not replayed:
  slice 9 adds only the test.
- **worker image memory.** Milestone 3. Blocks no slice. A worker on an image of its own fits its
  memory. Gates no slice. By hand on a test imp:
  `bash research/sandbox-memory/probe.sh <worker_image> 384 1 check.sh <model_id>`, with
  `MODEL_SECRET` set to the model key secret.

## Not written

- **code-made report ID.** Milestone 3. Blocks slice 3. `task.run_ended.reportID` is required, yet a
  code-made report has no report request to take it from. Intended: the writer of an end makes a
  short ID.
- **undefined task types.** Milestone 3. Blocks slices 2, 3 and 9. `EnvelopeView`, `RunSettings`,
  `TaskPolicy`, `RunSpan`, `SessionWindow` and the 5 worker plan types have no definition.
  `TaskRun`, `RunEnd` and 11 parameter lists are the sketch's reading. The head of
  `sketches/tasks/02-types.ts` lists them.
- **raise limits pin.** Milestone 3. Blocks slice 3. How the claim computes "the raised limits minus
  what the ended task run used" per meter, and pins it. Intended: a raise means a total for the
  piece of work.
- **starter label.** Milestone 3. Blocks slice 4. `{starter label}` in the frame's third paragraph
  has no text for a definition's task run or for the report mode `none`. Until it is written, a task
  with no report shape learns of `task.report` from the tool's description only.
- **briefID maker.** Milestone 3. Blocks slice 4. Which code makes the `briefID` of a definition's
  task run.
- "first enabled time" is filed once, in [the definitions list](definitions.md#not-written).
- **origin kinds.** Milestone 3. Blocks no slice. `origin.kind` has the values `start`, `trigger`,
  `message`, `raise` and `restart`. The first pass also lists `owner` and `timer`, with no case for
  either.
- **late spend scope.** Milestone 1. Blocks no slice. Whether the late-spend read filters by
  `taskRunID`. Slice 1 reads the whole thread, because it lands before the task run records.
- **cap seed sentences.** Milestone 3. Blocks no slice. The 2 sentences for a `maxCalls` key that
  `tools` lacks and a cap below 1. Intended: each gives the file and the key.
- **worker config sentences.** Milestone 3. Blocks slice 9. The 3 config refusals of a worker.
  Intended: the minutes sentence gives both figures, and the null-wait sentence gives the harness.
- **runner definition values.** Milestone 3. Blocks no slice. The key and the controls of each
  runner definition other than the nixie runner's key `nixie`.
- **rename file.** Milestone 3. Blocks no slice. The file name that `start-task-runners.ts` takes.
  Intended: `start-task-claim-pools.ts`.
- **pinned memory task.** Milestone 3. Blocks no slice. Slice 2 reads "the task that got pinned
  memory" in production. No file identifies that task.

## Known faults

- **stale step check.** Milestone 3. Blocks no slice. The first pass refuses a `task.report` call of
  a stale step because "the step has no open task run". `ToolRun.taskRun` is set per step, so it
  cannot show an expired lease. The docs follow the lease read in the write transaction, as
  `task.message` does.
- **on-behalf-of position.** Milestone 3. Blocks no slice. One statement lists 6 attributes and
  rules out a 7th. Another renders `on-behalf-of` "after `sent`". The docs follow the second,
  between `sent` and `fence`.
- **label task ID.** Milestone 3. Blocks slice 2. The rule puts the sender's task ID in every label.
  The example and the label table give the conversation's label no ID, and the place of the ID in a
  `persona: none` label is unstated. The docs follow the table.
- **frame agent name.** Milestone 3. Blocks no slice. One statement gives the frame an `agent.name`
  path. The frame text uses none. The docs follow the frame text.
- **runner lookup order.** Milestone 3. Blocks no slice. A comment on `resolve` gives 3 steps, and
  the lookup section gives 5. The docs follow the 5.
- **limit summary.** Milestone 3. Blocks no slice. The summary table gives a `limit` end as "its
  turns or dollars", while `StepResult.run.limit` accepts any meter. The docs follow the meter's
  `render`.
- **limit pause move.** Milestone 3. Blocks no slice. The first pass moves `writeTaskLimitPause` out
  of the nixie runner in the port slice, while the report slice writes the limit hold at the end.
  Both would write between the 2. The slices move the calls in slice 3.
- **nextRunAt source.** Milestone 3. Blocks part of slice 5.
  [A message wakes a wakeable task](../task-wake.md) has an asleep task with a schedule carry
  `nextRunAt` in `tasks.list`, the next fire of the schedule.
  [The task of a definition](../definition-tasks.md) gives the tasks module 2 readers, and neither
  returns a next fire. The definitions docs hold `readNextFire` and `next` on
  `definitions.listTasks`. The source of that time for the tasks module is not stated, and the docs
  follow neither.
- **worker size row.** Milestone 3. Blocks no slice. [Task workers](../task-workers.md) and
  [the sandbox sizes](../sandbox-sizes.md) give a worker the `systemTask` size row.
  [Model harnesses](../model-harnesses.md) sizes a worker by the `systemTask` row of the worker's
  harness, and on the Codex harness that row is `codexTask`. The 2 agree on the Agent SDK harness,
  which slice 9 builds on. The docs follow neither for a worker on a `codex` profile.
- **definition task next state.** Milestone 3. Blocks definitions slice 2. The commit table of
  [task runs and reports](../task-runs-and-reports.md) gives the next state `done` when the runner
  returns `done`, and has no row for a definition's task.
  [The task of a definition](../definition-tasks.md) has `pickNextState` return `waiting` for a task
  with `definition_id` set, and never `done`. Each doc states its own rule.
