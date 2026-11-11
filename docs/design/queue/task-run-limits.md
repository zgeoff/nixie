# Task run limits

This doc covers what bounds the use of a task run: its turn limit and its dollar limit, your raise
of those limits, the call caps of a task definition, and spend that a step records late. nixie
counts turns, dollars and tool calls per task run, so a limit bounds one piece of work and not the
whole life of a task.

This doc holds the rules. The sketches are the TypeScript files in `sketches/tasks/`: they hold the
type definitions and the exact texts, and each section here links the part it uses. Terms that this
doc does not define are in the [glossary](../../glossary.md) and in the Terms section of
[task runs](task-runs-and-reports.md), which defines step, claim, lease, limit hold, limit notice
and control record. An item marked `(open: <name>)` is not settled. [The open list](open/tasks.md)
gives each item by that name.

## Terms

- A **turn** is one model turn. A step runs at most one turn.
- A **meter** counts one kind of use in a task run: turns, dollars, or the calls of one tool.
- A **raise** is your command that lifts the limits of a task that is paused under the limit hold.
- A **restart** is your command that runs a task again after a stop or a failure.
- A **carried task run** is the task run that a raise or a restart opens to continue the work of an
  ended task run. A **piece of work** is an ended task run and every carried task run after it.
- A **call cap** is the most calls of one tool that one task run of a task definition may make.
- A **priced call** is a model call on a model profile that has prices.
- The **nixie runner** is the code that runs a task's model in a sandbox.
  [The task runner port](task-runner-port.md) describes runners.
- The **turn budget** is the dollars that a turn may spend before nixie interrupts it.

## Built

This section describes the code as it is before this design is built. Where a section after it
differs, the design replaces the built behaviour.

- `readTaskUsage` counts the turns and the dollars of a task over the task's whole thread. It
  returns the 2 counts and no sequence.
- `createCallBudget` fixes the turn budget when the turn starts. Its `onCall` is synchronous, and it
  compares only the turn's own calls against the turn budget.
- A step whose lease expired writes its `task.failed_turn_spent` record with no lease check. The
  record can land after another step started a turn. That turn can then pass the dollar limit by up
  to one turn's spend.
- The nixie runner calls `writeTaskLimitPause` before a turn and at the end of a turn.
  `writeTaskLimitPause` recounts turns and dollars, and writes the limit hold and the limit notice.
- Your raise resumes a task that is paused under the limit hold.

## Meters and limits

Types: [the meter type](sketches/tasks/02-types.ts), section B.

- The `task.run_opened` record carries the limits of the task run in its `limits` map. The claim
  that opens the task run writes them.
- Each key of `limits` has a meter. The keys are `turns`, `dollars`, and one `calls:<tool>` per call
  cap.
- The sessions module registers the meters `turns` and `dollars`. The dollar count needs the prices
  of the model profile, which the sessions module has.
- The tools module registers one meter for all keys that start with `calls:`.
- Before each step, nixie reads the meters of the open task run against `limits`. When a meter is at
  its limit, the step runs no turn, and the task run ends with the cause `limit`.
- During a turn, the nixie runner interrupts the turn when the turn's spend reaches the turn budget.
  The step's `StepResult.run` then carries the reached dollar limit.
- When `StepResult.run` carries a reached limit, the commit of the step ends the task run with the
  cause `limit` and writes the limit hold. [Task runs](task-runs-and-reports.md) describes that end.
- The nixie runner never writes the limit hold.

## A raise and the carried task run

Flow: [a claim opens a task run](sketches/tasks/03-flow.ts), section A.

- The claim of a step opens one carried task run when 2 things are true. The task's newest task run
  ended with the cause `limit`, `stopped` or `failed`. A control record of a raise or a restart is
  newer than that end.
- The `origin.sequence` of the carried task run is the sequence of that control record.
- The `carriesRunID` of the carried task run is the ID of the ended task run.
- The carried task run copies the `triggerKey`, the `briefID` and the `reportShape` of the ended
  task run.
- On a definition's task, the carried task run uses the `definitionHash` of the ended task run.
- After a raise, the limits of the carried task run are the raised limits minus the use of the ended
  task run. Your raise therefore sets a total for the piece of work.
- How nixie computes those limits per meter, and the limits after a restart, are not written. (open:
  raise limits pin)
- While the carried task run is open, the step of each claim runs in it.
- After the carried task run ends, its end is newer than the control record. A claim after that
  therefore opens no second carried task run. This covers a claim after a server start and after
  recovery.
- For a definition's task, `pickRunDefinition` of the definitions family also decides at a claim.
  Which of the 2 decisions comes first is not settled. (open: claim order)

## Call caps

`maxCalls` is a key of a definition file. [Task definitions](task-definitions.md) owns the key and
its parsing. Usage: [a call cap in a definition file](sketches/tasks/01-usage.ts), section D. Flow:
[a call past its cap](sketches/tasks/03-flow.ts), section E.

The seed check:

- The seed is the load of your definitions: [task definitions](task-definitions.md).
- At the seed, nixie refuses a task definition whose `maxCalls` has a tool that the definition's
  `tools` lack.
- At the seed, nixie refuses a task definition whose `maxCalls` has a cap below 1.
- The tools module exports the function that makes both checks. The texts of the 2 refusals are not
  written. (open: cap seed sentences)
- Which family's slice lands first is not settled. (open: seed check order)

A call:

- The claim copies each entry of `maxCalls` into `limits`, under the key `calls:<tool>`.
- When a call would be one more than its cap, nixie denies the call, and the tool does not run.
  Text: [the cap denial](sketches/tasks/02-types.ts), section F.
- The denial is a `tool_result` record with the outcome `denied`. It has no approval decision of
  yours.
- The denial uses the outcome `denied` because the list of outcomes is closed. A nixie release that
  does not know an outcome fails to decode the record.
- A call counts toward its cap when its outcome is `result`, `queued` or `unknown`.
- A call that has not returned counts toward its cap.
- A call with the outcome `invalid`, `denied`, `error` or `failed` does not count.
- `countRunCalls` in the tools module counts the calls of one tool with one `taskRunID`.
- The tools module cannot read the task run records, because the tasks module depends on the tools
  module. The step therefore passes the task run to each tool call as `ToolRun.taskRun`.
- A call cap needs no approval of yours, because a call cap only narrows what a task run may do.

## Late spend in the turn budget

A turn stops at the task's dollar limit even when a step whose lease expired records its spend after
the turn started. Only you loosen a limit, so nixie never lets a task pass its dollar limit. The
sessions module owns this rule. Flow: [the turn budget](sketches/tasks/03-flow.ts), section F.

- At the start of a turn, `readTaskUsage` returns the 2 counts and the sequence of the last record
  that it read.
- `createCallBudget` receives a function that reads late spend. The function is a plain function and
  not a port.
- On each priced call, the turn budget reads the `task.failed_turn_spent` records on the task's
  thread whose sequence is after that sequence. It lowers the dollars left by the sum of their
  dollars.
- That read is one indexed read per priced call.
- `onCall` returns a promise. The code that receives each model call from the guest waits for that
  promise before it receives the next model call.
- When the turn's own calls reach the lowered turn budget, nixie interrupts the turn. The limit
  notice then shows the true total.
- When the read of late spend throws, the step fails. The retry of the step reads the use of the
  task again from the log.
- Late spend only lowers the turn budget.
- Whether the read of late spend filters by `taskRunID` is not settled. (open: late spend scope)
- A worker's spend adds one record kind to the read of late spend: [task workers](task-workers.md).

## Not in scope

- A change to `task.failed_turn_spent`, the record that a failed commit writes for its spend.
- A declared list, per runner, of the limits that the runner can meter.
