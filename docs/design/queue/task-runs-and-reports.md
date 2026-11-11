# Task runs

This doc covers the task run: the records that mark it, when it opens and when it ends. A task run
is one stretch of a task's work that ends in one report. Three records on the task's thread mark
each task run, so nixie counts limits per task run and sends one report per task run.

This doc holds the rules. The sketches are the TypeScript files in `sketches/tasks/`: they hold the
type definitions and the exact texts, and each section here links the part it uses. Terms that this
doc does not define are in the [glossary](../../glossary.md). An item marked `(open: <name>)` is not
settled. [The open list](open/tasks.md) gives each item by that name.

Related docs:

- [The delivery of a report](task-report-delivery.md): the report mode and who gets the report.
- [The report shape](task-report-shape.md): the `task.report` call and the fields of a report.
- [Task run limits](task-run-limits.md): limits, a raise, call caps and late spend.
- [Task definitions](task-definitions.md) and [task runs of a definition](definition-task-runs.md):
  a task definition and its one task.

## Terms

- A **step** is one claimed unit of a task's work. A step runs at most one model turn. The **claim**
  is the moment a claim pool takes the step, and the **lease** is the step's claim, which expires.
  [Tasks](../../architecture/core/tasks.md) describes all 3.
- A **started task** is a task that a `task.start` call made. Its **starter** is the task whose
  model made the call. The conversation is a task, so it can be a starter.
- A **definition's task** is the one task that runs every task run of a task definition.
- The **report target** is the task that receives a report. For a started task, the report target is
  the starter. For a definition's task run, the report target is the conversation.
- The **report mode** is one of `wake`, `next_turn` and `none`. It decides whether nixie sends the
  report to the report target as a message, and whether that message wakes the report target.
- A record's **erasable fields** are the encrypted part of the record that a forget destroys.
  [Erasable fields](../../architecture/core/erasable-fields.md) describes them.
- The **hop limit** stops a chain of tasks that wake each other.
  [Task messages](../../architecture/core/task-messages.md#the-hop-limit) describes it.
- The **limit hold** is the `task.limit_reached` record. It pauses a task until you raise the limit.
  The **limit notice** is the `task.limit_notice` record, a message from nixie about the pause.
- A **control record** is the record of a command of yours on a task: a stop, a close, a restart or
  a raise of a limit.
- A **carried task run** is the task run that a raise or a restart opens to continue the work of an
  ended task run. [Task run limits](task-run-limits.md) describes it.
- The **end writer** is `writeRunEndInTransaction`, the one function that ends a task run.
- A **fold** is the code that builds a projection from records.

## Built

This section describes the code as it is before this design is built. Where a section after it
differs, the design replaces the built behaviour.

- The model sends a report as a `task_message` of kind `report`, through `task.message`.
  `planTaskReport` applies the task's report mode to that message. `task.start` defaults `report` to
  `wake`.
- Every tool record of a started task carries the task's ID as its tool run ID. `readTaskUsage`
  counts turns and dollars over the task's whole thread.
- A started task waits after every turn and after its report.
- A task at its limit pauses under the limit hold. `writeTaskLimitPause` writes the limit notice,
  and a raise resumes the task.
- A step writes `tool_called`, `tool_result` and `task.failed_turn_spent` with no lease check.

## The task run records

The tasks module owns 3 record kinds on the task's own thread: `task.run_opened`,
`task.run_report_requested` and `task.run_ended`. Types:
[the task run records](sketches/tasks/02-types.ts), section A.

- The task never reads these 3 kinds as inbox input.
- nixie writes `task.run_opened` in the transaction of the claim, before `task.step_started`.
- `task.run_opened` carries the report mode, the report target, the report shape and the limits of
  the task run. Every reader of those 4 values reads them from this record.
- A change to a task definition therefore applies from the next task run that opens.
- A `task.report` call writes `task.run_report_requested`.
- The end writer writes `task.run_ended` last in the transaction that ends the task run.
- The `endedBy` of `task.run_ended` is what ended the task run: a step, your stop, your close, or a
  claim.
- `task.run_ended` copies `definitionID`, `triggerKey` and `carriesRunID` from `task.run_opened`. A
  fold can therefore read everything about an end from `task.run_ended` alone.
- `cause` in `task.run_ended` and `origin.kind` in `task.run_opened` are stored as strings. Code
  reads each through a closed union with an `unknown` member. A nixie release that does not know a
  value therefore decodes the record and reads the value as `unknown`.

The projection `task_runs`. Types: [the projection](sketches/tasks/02-types.ts), section G.

- The fold of `task_runs` reads the 3 kinds and no other.
- A unique partial index allows at most one open task run per task.
- `readRunState`, `readPreviousRun`, `readRunUsage` and `readFinishedRuns` read `task_runs`. Types:
  [the readers](sketches/tasks/02-types.ts), section B.
- `readFinishedRuns` returns ended task runs. Each one carries the sequence of its `task.run_ended`
  record, so a caller can page by it.

Which task run a record belongs to:

- `tool_called`, `tool_result` and `task.failed_turn_spent` carry an optional `taskRunID`. A step
  writes these 3 kinds with no lease check, so only they can land after their task run ended.
- `pickRecordRun` decides which task run a record belongs to. A record with a `taskRunID` belongs to
  that task run.
- A record with no `taskRunID` belongs to the newest task run that opened at or before the record.
- `readRunRecords` is the only reader that applies that rule. Every count of a task run's use reads
  through it.

What a runner sees:

- A runner receives the open task run as `StepInput.run`, and returns `StepResult.run`.
- A runner never writes one of the 3 record kinds.

## When a task run opens

A task run has 3 states in order: pending, open, ended. Flow:
[a claim opens a task run](sketches/tasks/03-flow.ts), section A.

Pending:

- A task run is pending between the wake of the task and the claim of the first step.
- The projection has a row only from the claim. `readRunState` therefore works out `pending` from
  the task's unread inbox records.
- A started task has a pending task run when it has unread waking input and no open task run.
- For a definition's task, [task runs of a definition](definition-task-runs.md) defines when a task
  run is pending.

Open:

- At the claim of a step of a task with no open task run, nixie opens a task run.
- For a started task, the unread waking input is what the task run opens for.
- For a definition's task, `pickRunDefinition` decides whether a task run opens and for what:
  [task runs of a definition](definition-task-runs.md).
- After a raise or a restart, the claim opens a carried task run:
  [task run limits](task-run-limits.md). The order of that check against `pickRunDefinition` is not
  settled. (open: claim order)
- When the process dies after nixie wrote a raise or a restart and before the claim committed, the
  next claim opens the carried task run.
- When a claim finds the limit hold and the task has no open task run, nixie pauses the task and
  opens no task run.
- `origin.kind` records why the task run opened. Its list of values is not settled. (open: origin
  kinds)
- On a definition's task, every task run carries `definitionID`, `definitionHash` and `briefID`.
  Which code makes the `briefID` is not settled. (open: briefID maker)
- `triggerKey` is the dedupe key of the trigger fire that the task run opened for. A task run that a
  message opened has a null `triggerKey`.

A claim for a task with an open task run:

- The step runs in the open task run. This covers a rerun of a step and a step that a waking message
  caused. Neither opens a second task run.
- One case differs. A task run is idle when its last turn was quiet and it is open. When a claim
  finds an idle task run and an unread `trigger.fired` record whose dedupe key is not the
  `triggerKey` of the idle task run, nixie ends the idle task run with the cause `no_report`. In the
  same transaction, nixie opens the next task run.

## When a task run ends

The end writer builds the report body, delivers the report and writes `task.run_ended`:
[the delivery of a report](task-report-delivery.md). When the task has no open task run, the end
writer writes nothing. Flow: [a step's commit](sketches/tasks/03-flow.ts), section B.

When a step commits, nixie takes the first row that applies (open: definition task next state):

| The commit finds                                 | End cause   | The task's next state |
| ------------------------------------------------ | ----------- | --------------------- |
| a report request in this task run                | `reported`  | what the step asked   |
| a reached limit in `StepResult.run`              | `limit`     | `ready`               |
| the runner returned `done`                       | `no_report` | `done`                |
| more work is queued for the task                 | no end      | what the step asked   |
| the task waits for a reply to a message it sent  | no end      | `waiting`             |
| the first step of the task run ran no model turn | `no_work`   | `waiting`             |
| a quiet turn, and the task is wakeable           | no end      | `waiting`             |
| a quiet turn, and the task is not wakeable       | `no_report` | `waiting`             |

- A quiet turn is a turn in which the model sends no message and does not call `task.report`.
- After a quiet turn on a wakeable task, the task run is open and idle. nixie writes no report then,
  because a report on every quiet turn would wake the starter each time.
- [Waking a task](task-wake.md) defines wakeable. A task that is not wakeable waits for its next
  trigger fire.
- After a `limit` end, the task is `ready` and paused under the limit hold.
- Your stop ends the task run with the cause `stopped`, in the transaction that writes the stop.
- Your close ends the task run with the cause `closed`, in the transaction that writes the close.
- When a step error fails the task, the transaction of that error ends the task run with the cause
  `failed`.
- `pickTaskAfterReport` decides the task's next state after a `reported` end. It returns the state
  that the step asked for.
- A started task that reported waits and is wakeable. It is not `done`, because a `done` task
  refuses messages and has no sandbox.
- When a step's task run has a report request, `runTaskStep` commits the step without another model
  turn. This rule applies to every runner.

Failures:

- When the lease of a step that called `task.report` expires, the step reruns in the same task run
  and does no work. The commit of the rerun sends the first summary and the first fields under the
  first `reportID`.
- When a step whose lease expired tries to commit, its lease check fails, and it ends no task run.
- When the transaction that ends a task run throws, the task run is open, and the retry of the
  caller ends it. This rule covers your stop and your close.
- When the process dies, nixie ends no task run at recovery. The step reruns in the open task run,
  and the commit of the rerun ends it.

## The start time of the previous task run

A task run of a task definition receives the start time of the previous task run of that definition.
A scheduled task that reads your messages since its previous task run passes that time as the `from`
of `log.read`, so it reads each message once.

- For every task run of a task definition, nixie renders one `<input>` block in the first message.
  `readPreviousRun` gives the previous task run. The name and the text of the block are not settled.
  (open: previous start block)
- The block gives the time as a UTC time that ends in `Z`, the form that `log.read` accepts as
  `from`.
- The model needs no tool call to get the time.
- For the first task run of a task definition, the time is the time the definition was first
  enabled. Which record carries that time is not settled. (open: first enabled time)
- Which time a carried task run gets is not settled. (open: carried start time)
- The rule assumes that a `log.read` up to a time and a `log.read` from the same time return each
  message exactly once between them. That is not checked. (open: log.read edge)

## Not in scope

The design has none of these:

- A key on `task.run_ended` for whether the model filled the fields of the report shape.
- A hook that lets another module write records in the transaction that ends a task run.
- An ordinal or a short ID for a task run, and a registry of `origin.kind` values.
- The start time of the previous task run as a member of the `trigger` block.
- A named query, and any input that a task definition declares.
- A fixed time span in the instructions of a task definition, in place of the start time. With a
  fixed span, an overlap reads a message twice, and a skipped task run misses messages.

Other docs own these:

- Parsing a definition file, `readDefinitionRunPolicy`, `pickRunDefinition` and the `trigger` block:
  [task definitions](task-definitions.md) and [task runs of a definition](definition-task-runs.md).
