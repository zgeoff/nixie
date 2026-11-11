# Task workers

This doc covers the worker tool, `worker.run`. A task or the conversation gives one bounded question
to a worker through one call of the tool. The worker runs its own model session in a sandbox of its
own, with some of the tools of its caller, and stops at the first limit that it reaches. The caller
gets the answer in the same turn. The outside text that the worker read never enters the caller's
context. [Decision 0053](../../decisions/0053-workers.md) records the choice.

This doc holds the rules. The sketches are the TypeScript files in `sketches/tasks/`: they hold the
type definitions and the exact texts, and each section here links the part it uses. Terms that this
doc does not define are in the [glossary](../../glossary.md) and in the Terms section of
[task runs](task-runs-and-reports.md), which defines task run, step, claim, lease, started task and
starter. An item marked `(open: <name>)` is not settled. [The open list](open/tasks.md) gives each
item by that name.

## Terms

- A **worker** and a **worker run** are in the glossary. A worker run is one call of `worker.run`,
  from the call to its result.
- The **caller** is the task whose model called `worker.run`. The conversation is a task, so it can
  be the caller. The **calling step** and the **calling turn** are the step and the turn of the
  caller in which the call happens.
- The **step token** is the credential that a step creates for its own tool calls.
- The **step hold** is a value of the type `ToolStepHold`. A step gives it to each of its tool
  calls. It carries 2 stop signals of the step and access to the turn budget.
- The **turn budget** is the dollars that the calling turn may spend before nixie interrupts it. A
  caller with no dollar limit, such as the conversation, has no turn budget.
- A **tool run** is the set of facts that every tool call of one step receives: the type `ToolRun`.
- The **worker cap** is the largest number of worker runs at one time, from the config key
  `tasks.workerRuns`. A **slot** is one place under the worker cap.
- The **guest** is the program inside the sandbox that runs the model session.
- A **model harness** is the code that runs one kind of model runtime:
  [model harnesses](model-harnesses.md).
- A **sandbox owner** is the ID that a sandbox is created under.
- **Recovery** is what nixie does at server start after a crash:
  [leases and recovery](../../architecture/core/leases-and-recovery.md).

## Built

This section describes the code as it is before this design is built. Where a section after it
differs, the design replaces the built behaviour.

- The config schema has the model role `worker`, with a list of the harness capabilities that the
  role needs.
- A sandbox of the kind `worker` has 2 things: the model grant and the route to the tool endpoint.
  It has no egress.
- `createWorkerSandbox` creates a sandbox of the kind `worker` for the session of a started task, on
  the conversation image. It destroys the other sandboxes of the same sandbox owner.
- `makeSystemTaskRunner` gives the sandbox of a system task 1 vCPU and 1024 MiB.
- Recovery destroys leftover sandboxes. It spares the sandboxes of the conversation, of the checker
  model and of every open started task.
- A step creates a step token. The step gives each of its tool calls 2 functions, `reserveImages`
  and `endSilently`.
- The tool endpoint sets `idleTimeout: 0`. Its `queuedWaitMs` of 10 seconds covers queued actions
  only. The conversation guest sets no tool-call timeout.
- `createCallBudget` sets the turn budget when the turn starts. `readTaskUsage` counts each
  `model.turn_ended` record on a thread as a turn of the task.

## The tool

The sessions module owns `worker.run`. Usage: section H of
[the usage sketch](sketches/tasks/01-usage.ts). Types and texts: section M of
[the types sketch](sketches/tasks/02-types.ts).

What a worker is:

- The server registers `worker.run` only when the config sets the `worker` role.
- A worker runs as a function behind one tool call. A worker is not a task and not a runner.
- A worker has no lease, inbox, stored state, report, brief or message envelope, and never claims a
  step.
- A worker run happens inside a step that nixie claimed through `claimLease`. Whatever stops the
  claims of a task therefore stops the workers of that task.
- A worker run is not durable. When the calling step reruns, the model can call `worker.run` again,
  and that call starts another worker run.
- A started task has `worker.run` only when 2 things are true: the `task.start` call lists
  `worker.run` in its tools, and the starter has `worker.run`.

The input:

- The question is 1 to 8000 characters, and the call gives at most 50 distinct tool names.
- The input accepts no other key. A caller cannot choose a model, a model profile or a limit.

The checks before a worker runs:

- `planWorkerRun` makes every check of a call before a worker runs. Texts of the refusals: section M
  of [the types sketch](sketches/tasks/02-types.ts).
- `runWorker` accepts only the plan that `planWorkerRun` returns. `runWorker` never accepts a raw
  list of tools, so every worker run has passed the checks.
- A refusal is the error sentence of the tool call. The worker tool adds no value to the closed list
  of `tool_result` outcomes.
- `planWorkerRun` refuses a call that gives a tool that the caller does not have. A worker therefore
  never has a tool that its caller lacks.
- `planWorkerRun` refuses a call that gives one of these tools: `task.start`, `task.message`,
  `tasks.list`, `task.report`, `turn.end_silently` or `worker.run`. A worker therefore starts no
  task and sends no task message.
- `planWorkerRun` refuses a call that gives a memory tool.
- `planWorkerRun` refuses a call that gives a tool that only the conversation may use. This applies
  even when the conversation is the caller, because the step token of a worker carries no
  conversation session.

## The limits

Config keys: section I of [the usage sketch](sketches/tasks/01-usage.ts).

- A worker run has 4 limits: minutes, turns, tokens and dollars. The worker run stops at the first
  limit that it reaches.
- The 4 limits come from the config key `models.limits.workerRun`. The limits of a task run come
  from `models.limits.taskRun`.
- The dollar limit of a worker run is the smaller of 2 values: `dollars` of
  `models.limits.workerRun`, and the dollars that the caller has left when the call starts.
- The conversation has no dollar limit. For a worker that the conversation calls, the dollar limit
  is `dollars` of `models.limits.workerRun`.
- The minutes count from the start of the call. They include a wait for a slot and the start of the
  sandbox.
- nixie gives the turn limit to the guest as its limit of model calls, through the `turn-limit`
  capability of the model harness. At the turn limit, the model session ends with the turn outcome
  `limit`.
- When a worker run reaches a limit, the call returns an error sentence that gives the limit and the
  use of the worker run. The caller gets no partial answer. Texts: section O of
  [the types sketch](sketches/tasks/02-types.ts).

The worker cap:

- When every slot is taken and `whenFull` is `wait`, a call waits for a slot. Calls get slots in the
  order in which they arrived. The wait counts toward the minutes of the call.
- When every slot is taken and `whenFull` is `error`, the call returns the sentence of the worker
  cap and writes no worker record.
- The worker cap counts worker runs in one server process. A deployment has one server process that
  runs steps, so the worker cap covers the deployment.

## The config

- You turn the `worker` role on in the config of your deployment.
- nixie refuses a config that sets `models.limits.workerRun` when the model profile of the `worker`
  role has no price table.
- `toolCallWaitMs` is how long a model harness waits for one tool call:
  [model harnesses](model-harnesses.md). Whether each model runtime obeys it is not checked. (open:
  agent-sdk tool-call timeout)
- The minutes limit of a worker run must end at least 30 seconds before `toolCallWaitMs`. nixie
  refuses a config whose `models.limits.workerRun.minutes` is longer than `toolCallWaitMs` minus 30
  seconds, for any model harness that can run a caller of `worker.run`.
- That check uses the minutes that the loaded config has, and never a constant in code. The check
  converts both values to one unit.
- Because of that check, the limit error of a worker run reaches the caller before the model runtime
  gives up on the tool call.
- nixie refuses a config with the `worker` role when a `conversation` profile or a `task` profile
  runs on a model harness whose `toolCallWaitMs` is null.
- The texts of those 3 refusals are not written. (open: worker config sentences)

## The step hold and the 2 stops

Types: section M of [the types sketch](sketches/tasks/02-types.ts).

- When a step creates its step token, the step gives each of its tool calls the step hold.
- The step token of a worker gives no step hold. A worker therefore cannot run a worker.
- A hard stop ends the guest at once. 2 things cause a hard stop: the `signal` of the step hold, and
  the end of the minutes.
- The `signal` of the step hold fires when the calling step has its lease expire or is ended.
- When the `signal` fires, the worker run ends, nixie destroys the sandbox, the tool call rejects,
  and the `worker.run_ended` record has the outcome `aborted`.
- A soft stop lets the guest end its current model call. 3 things cause a soft stop: the `interrupt`
  of the step hold, the token limit of the worker run, and the dollar limit of the worker run.
- The `interrupt` of the step hold fires when the calling turn is interrupted or reaches its turn
  budget.
- After a soft stop, the call returns an error sentence with the use of the worker run.

## Spend

- The dollars of a worker run count toward the dollar limit of the caller. With a separate worker
  budget, a task could spend more than the limit that you gave it.
- nixie prices the dollars of a worker run on the model profile of the `worker` role.
- At the end of each model call of a worker, nixie writes one `worker.turn_ended` record with the
  dollars of that call.
- `readTaskUsage` and the count of dollars of a task run add the dollars of each `worker.turn_ended`
  record on the thread. They add no turn for it.
- When the process dies, the use of the caller therefore misses at most the model call that was
  running.
- A model call of a worker never writes a `model.turn_ended` record, because `readTaskUsage` counts
  each `model.turn_ended` record as a turn of the task.
- For each priced model call of a worker, `runWorker` calls `onSpend` of the step hold. `onSpend`
  lowers what is left of the turn budget, so the spend of a worker can make nixie interrupt the
  calling turn.
- `getSpentDollars` of the turn budget returns the spend of the calling turn's own model calls and
  not the spend of its workers. The `worker.turn_ended` records carry the spend of the workers.
- [Task run limits](task-run-limits.md) describes how the turn budget reads late spend. That read
  includes the `worker.turn_ended` records of the worker runs that another step started.
- That read excludes the worker runs that the calling step started, because their spend reached the
  turn budget through `onSpend`. The calling step has the IDs of its own worker runs.
- A tool call that a worker makes belongs to the task run of the caller, and it counts toward the
  call caps of that task run. The tool run of the worker carries the same `taskRun` as the tool run
  of the calling step.

## The worker run and its sandbox

`runWorker` owns 5 things of a worker run: the end of the minutes, the dollar limit, the 2 stops,
the slot and the sandbox. Every way out of `runWorker` goes through one block of code that writes
the end record and frees those things. Flow: section K of
[the flow sketch](sketches/tasks/03-flow.ts).

- `runWorker` calls 2 ports: the sandbox adapter and the model harness.
- A worker run has the states `waiting`, `starting` and `running`. They exist only in memory. nixie
  stores no state of a worker run.
- The sandbox of a worker run has the kind `worker`. It has the route to the tool endpoint and the
  model grant of the `worker` role's model profile. It has no other grant and no egress.
- A worker reads a web page only through nixie's fetch tool, which runs on the host.
- The sandbox runs the image of the model harness of the `worker` role's model profile, with the
  `systemTask` sandbox size. Whether that size fits is not checked. (open: worker image memory)
  (open: worker size row)
- The sandbox owner is `worker_run:<workerRunUUID>`. The sandbox owner is never the task ID of the
  caller, because `createWorkerSandbox` destroys the other sandboxes of the same sandbox owner.
- The create of the sandbox has a time limit. When the sandbox arrives after the time limit, nixie
  destroys it.
- nixie destroys the sandbox after it sent the result of the call. The slot is free when the destroy
  ends.
- When a destroy fails, nixie tries it again before the create of the next worker run.
- At recovery, nixie destroys every sandbox whose sandbox owner is a worker run. Recovery never
  spares the sandbox of a worker run.

## The worker records

Types: section N of [the types sketch](sketches/tasks/02-types.ts).

- A worker run writes 3 record kinds on the thread of the caller: `worker.run_started`,
  `worker.turn_ended` and `worker.run_ended`.
- The parent of each of those records is the `tool_called` record of the `worker.run` call. Each
  carries an optional `taskRunID`.
- A tool call of a worker writes its `tool_called` record and its `tool_result` record through the
  tool endpoint, on the thread of the caller. Their tool run ID is the UUID of the worker run, and
  their model and model profile are those of the worker.
- The answer of a worker is in the `tool_result` record of the `worker.run` call, with the source
  `untrusted`.
- When nixie rebuilds the session of the caller, it skips every record whose tool run ID is the UUID
  of a worker run. Whether the built rebuild reads such records is not checked. (open: rebuild
  replays by thread)

## Not in scope

The design has none of these:

- Approvals of yours for the actions of a worker.
- A sandbox image of its own for a worker, and a sandbox size of its own.
- A claim pool or a runner for worker runs, and a worker as a kind of task.
- A fixed set of tools for a worker, and kinds of worker that a config declares.
- A structured result for a reached limit, in place of the error sentence.

Other docs own these:

- The egress policy of a production sandbox, and the tool-call wait of a model runtime.
