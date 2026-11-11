# Tasks: the runner port, the worker and the end-to-end checks as slices

Slices 8 to 10 follow slices 1 to 4 in [the task slices](tasks.md) and slices 5 to 7 in
[the wake and grant slices](tasks-wake-and-grant.md). Open items are in
[the open list](../open/tasks.md); a check that rests on one is marked and is not a gate.
"Definitions slice n" is a slice of [the definitions slices](definitions.md).

Run `bun run models && bun run test:bundles` once before the unit tests of a slice. Tests are in the
unit lane unless marked. "Creates" marks a test file that the slice adds.

Each slice has the ID `tasks-<n>`, which is unique across the queue, and each "Needs" names a slice
by its ID. In any other field of this file, "slice n" means `tasks-n`.
[The work list](../work-list.md) gives the build order.

### tasks-8. The task runner port

[The runner port and worker issue](https://linear.app/zgeoff/issue/GEO-1793).

- **Outcome:** Each runner has a definition, one registry resolves a task to its runner,
  `task.start` takes one variant per startable runner, and nixie refuses a control that a runner
  lacks.
- **Follows:** [the task runner port](../task-runner-port.md); `02-types.ts`, section P;
  `03-flow.ts`, section J.
- **Work:** the port types and `buildTaskRunnerRegistry`; one definition per row of the table of
  runner definitions; `TaskSetup` as a union, in place of the built interface; the variants of
  `task.start`; the control refusal; `readKeptSandboxOwners`. Delete the server wrapper that picks
  the queue check's step.
- **Needs:** tasks-3, memory-gate-2, memory-gate-3. tasks-3 gives `StepResult.run`. memory-gate-2
  and memory-gate-3 are [the delete of the built-in memory tasks](../memory-task-delete.md), in
  milestone 1: they supply the step that only empties the inbox, and after them the 2 leftover tasks
  run no model. Step 3 of `resolve` is not part of this slice. It reads a definition through the
  reader of definitions-2, which needs this slice, and it is blocked by "runner key" in
  [the definitions open list](../open/definitions.md). `resolve` skips that step, and no slice holds
  it.
- **Check:**
  - `bun test modules/tasks/src/build-task-runner-registry.test.ts` (creates): a task with no stored
    `runner` resolves to the default; a fixed task resolves to its definition; a shared key, a
    definition with no step and a step with no definition each throw.
  - `bun test modules/tasks/src/build-task-start-tool.test.ts`: a second, test-only definition adds
    its variant to the input, and its own `plan` checks it; a rule on `task.start/<key>` matches
    only that variant.
  - `bun test libs/task-control/src/plan-task-control.test.ts`: a control that the definition lacks
    is refused with `runner_lacks_control`.
  - `bun run ci:compatibility:run-contract-growth-check` passes.
- **Rollback:** no migration. `task.created` has the 3 optional keys. The previous release drops
  them on decode and runs a task of another runner on the nixie runner with default options, so
  first close each task stored with a runner that the previous release lacks.
- **Milestone:** 3.

### tasks-9. The worker tool

[The runner port and worker issue](https://linear.app/zgeoff/issue/GEO-1793).

- **Outcome:** `worker.run` runs a worker in its own sandbox inside 4 limits, its spend counts
  toward the calling task, and recovery destroys a worker's sandbox.
- **Follows:** [task workers](../task-workers.md); `02-types.ts`, sections M, N and O; `03-flow.ts`,
  section K.
- **Work:** the tool, `planWorkerRun`, `runWorker`, the step hold, the 3 record kinds, the 2 config
  keys, the config checks, the worker's part of the late-spend read, the skip of worker records in a
  session rebuild, and the recovery rule. The design doc on tasks, the glossary and the sandbox
  architecture doc describe the `worker` sandbox kind. Where a doc has "the worker runner", it means
  a worker run inside a claimed step.
- **Needs:** tasks-1, tasks-3, tasks-6, tasks-8, harnesses-1, harnesses-2, sandboxes-1. harnesses-1
  and harnesses-2 give `toolCallWaitMs` and its probe, of [model harnesses](../model-harnesses.md).
  sandboxes-1 gives the `systemTask` sandbox size row. tasks-6 gives the log grant of the last case
  of `run-worker.test.ts`. From harnesses-3, a slice of milestone 4, this slice uses 2 parts: the
  `one-off` turn profile of `toTurnProfile`, and the turn outcome `limit` on the `ended` frame.
  Blocked by the open items "agent-sdk tool-call timeout", "undefined task types" and "worker config
  sentences". From the model harness the worker uses: the harness of the worker's profile for its
  grant, its one-off turn profile, its tool-use meta key and its image key; a single session with a
  turn limit and per-call usage; and the turn outcome `limit` at the turn limit.
- **Check:**
  - `bun test modules/sessions/src/plan-worker-run.test.ts` (creates): one case for each refusal.
  - `bun test modules/sessions/src/run-worker.test.ts` (creates), on the test sandbox: a task starts
    a worker, the worker fetches a page through the fetch tool, and the task gets the result; one
    test per limit (minutes on the test clock, turns, tokens, dollars), each with the caller's
    error; a worker cannot call a tool that its caller did not pass; a worker's spend lowers the
    calling task's dollars left; with `max: 1`, a second call waits under `wait` and gets the cap's
    sentence under `error`; an aborted step destroys the sandbox, returns nothing and writes
    `aborted`; an adapter whose create never returns gives the minutes error at the limit on the
    test clock.
  - With tasks-6, in the same file: a worker of a granted task reads the conversation's thread, and
    a worker of any other task does not.
  - `bun test modules/sessions/src/read-task-usage.test.ts`: `worker.turn_ended` adds its dollars
    and no turn.
  - `bun test modules/sessions/src/start-nixie-runner.test.ts`: a `worker.turn_ended` record of
    $0.01 from another step's worker run, written after the turn's first priced call, lowers the
    turn's dollars left by $0.01; one from the turn's own worker run counts once.
  - `bun test modules/sessions/src/read-session-opening.test.ts`: a rebuilt session of the calling
    task skips a worker run's `tool_called` records.
  - `bun test modules/models/src/build-models-config-schema.test.ts`: for each harness that can
    serve a caller of `worker.run`, a `workerRun.minutes` less than 30 seconds shorter than that
    harness's wait is refused, with both figures in the sentence; a config with the `worker` role
    and a `task` profile on a test harness whose wait is null is refused, with the harness in the
    sentence; the same config without the role is accepted; a `worker` profile with no price table
    is refused. The test waits no real minutes.
  - `bun run test:agent-sdk guests/conversation/` (agent-sdk lane): a test of the guest's query
    options shows that the guest passes the harness's wait to the runtime as the tool-call timeout.
    The probe itself belongs to the harnesses family.
  - `bun run test:e2e` (e2e lane, creates `e2e/crash/worker.test.ts`): after a kill during a worker
    run, recovery destroys the worker's sandbox and spares the calling task's, and the task's
    dollars used include the worker's finished model calls.
  - `bun run test:imp modules/sessions/src/run-worker.imp.test.ts` (creates; test imp, by hand): a
    worker in a real imp reaches the model through the broker and reaches nothing else.
  - Run first: (open: rebuild replays by thread), (open: newer log replay).
- **Rollback:** no migration. The log has the 3 `worker.*` kinds. First remove
  `models.limits.workerRun` and `tasks.workerRuns` from the config, because both schemas are strict
  and the previous release refuses to start on an unknown key.
- **Deploy:** you turn the `worker` role on in your deployment's config.
- **Milestone:** 3.

### tasks-10. The recorded end-to-end checks

[The end-to-end checks issue](https://linear.app/zgeoff/issue/GEO-1797).

- **Outcome:** One recorded turn on a preview and 2 tests show a task, its worker, its report and
  its messages working together.
- **Follows:** [the end-to-end checks](../task-end-to-end-checks.md).
- **Needs:** tasks-3, tasks-9, memory-gate-5. memory-gate-5 gives
  [memory tools on tasks](../memory-task-tools.md).
- **Check:**
  - Preview, by the preview API check runbook: the recorded turn, with its records in the pull
    request. The records show the `worker.run` call, the `task.report` call and the report on the
    conversation's thread.
  - `bun test integration/poisoned-page.test.ts`: a started task that has `memory.remember` hands a
    poisoned page to a worker. Every memory write that the page causes is a proposal with outside
    content as its source, the worker can call no tool that its caller did not pass, and no task
    message body counts as a message from you.
  - `bun test modules/memory/src/read-moment-span-page.test.ts`: a moment saved over a task thread
    returns every record through `moment.read`, with tool calls, results, worker records and task
    messages, each with its source.
- **Milestone:** 3. No step writes to production.
