# Task runs: records, ends and limits

- **Status:** draft
- **Work items:** [task run records and `task.report`](https://linear.app/zgeoff/issue/GEO-2113),
  [the brief of a definition's task run](https://linear.app/zgeoff/issue/GEO-2586),
  [the wake rule](https://linear.app/zgeoff/issue/GEO-1865),
  [the previous task run's start](https://linear.app/zgeoff/issue/GEO-2585),
  [the runner port](https://linear.app/zgeoff/issue/GEO-2588),
  [the worker tool](https://linear.app/zgeoff/issue/GEO-1793)

Three records on a task's thread mark each task run, and the `task_runs` projection folds them. This
part holds the records, the projection and its readers, how a claim opens a task run, how one end
writer ends it and delivers its report, and the limits and call caps that count per task run. The
report itself is in [reports](reports.md), and the [README](README.md) has the diagram and the
terms.

## Contracts

### The records

```ts
// tasks module. The 3 kinds sit on the task's own thread, and the task never reads them as input.
// task.run_opened: written in the claim's transaction, before task.step_started.
interface TaskRunOpened {
  taskID: string;
  runID: string; // crypto.randomUUID()
  openedByStep: string; // the step key of the first step
  origin: { kind: string; sequence: number | null }; // kind read as RunOrigin; sequence: the record that gave the work
  definitionID: string | null; // null for a started task
  definitionHash: string | null; // the definition version this task run pins; null for a started task
  triggerKey: string | null; // the dedupe key of the trigger fire; null when a message opened it
  carriesRunID: string | null; // set when origin.kind is raise or restart
  briefID: string | null; // createShortID(), made by the claim; null for a started task
  report: { mode: TaskReport; target: string | null }; // TaskReport: built. target: null only under the mode none
  reportShape: ReportShape | null;
  limits: RunLimits;
}

interface RunLimits {
  turns: number;
  dollars: number;
  calls: Record<string, number>; // tool name → cap; {} for a started task
}

// task.run_report_requested: what an accepted task.report call writes. Erasable: { summary, fields? }
interface TaskRunReportRequested {
  taskID: string;
  runID: string;
  stepKey: string;
  reportID: string; // createShortID(); the delivered message's ID
}

// task.run_ended: written last in the transaction that ends the task run. Erasable: { body }, a string
interface TaskRunEnded {
  taskID: string;
  runID: string;
  cause: string; // read as RunEndCause
  detail: Record<string, string | number>; // limit: { meter, used, limit }; failed: { errors }; else {}
  endedBy: string; // step:<stepKey> | control:stop | control:close | claim:<stepKey>
  definitionID: string | null; // this and the next 2: copied from task.run_opened
  triggerKey: string | null;
  carriesRunID: string | null;
  used: { turns: number; dollars: number; calls: Record<string, number> }; // the counts at the end
  reportID: string; // the request's, or createShortID() for a report that code writes
  reportTo: string | null;
  delivery: 'wake' | 'next_turn' | 'kept';
}

// Stored as strings, read through closed unions, so a release that lacks a value reads `unknown`.
type RunEndCause =
  | 'reported'
  | 'limit'
  | 'stopped'
  | 'closed'
  | 'failed'
  | 'no_work'
  | 'no_report'
  | 'unknown';
type RunOrigin =
  | 'start'
  | 'trigger'
  | 'message'
  | 'owner'
  | 'timer'
  | 'event'
  | 'raise'
  | 'restart'
  | 'unknown';

// tool_called, tool_result, task.failed_turn_spent: { …existing fields, taskRunID?: string }
```

### The projection and its readers

```ts
// tasks module: one row of task_runs, folded from the 3 kinds and no other
interface TaskRun {
  runID: string;
  taskID: string;
  openedSequence: number;
  startedAt: Date;
  opened: TaskRunOpened;
  reportID: string | null; // set by task.run_report_requested
  ended: { record: TaskRunEnded; sequence: number; endedAt: Date } | null;
}

type RunState =
  | { kind: 'none' } // no open task run and no unread waking input
  | { kind: 'pending' } // unread waking input and no open task run
  | { kind: 'open'; run: TaskRun; phase: 'active' | 'waiting_reply' | 'idle' };
// phase, from the built task row: waiting_reply when the task has an open wait; idle when it is
// `waiting` with no open wait (its last turn was quiet); active otherwise.

readRunState(context, 't4m2');
// → { kind: 'pending' }: an unread brief and no open task run

declare function readRunState(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<RunState>;
declare function readPreviousRun(
  context: Pick<TasksContext, 'log'>,
  run: TaskRun,
): Promise<TaskRun | null>; // the newest opened before `run` on its task
declare function readEndedRuns(
  context: Pick<TasksContext, 'log'>,
  query: { definitionID?: string; taskID?: string; beforeSequence?: number; limit: number }, // pages by ended.sequence
): Promise<readonly TaskRun[]>; // each with `ended` set

// The rule of which task run a record belongs to, pure. `runs` are the task's rows, oldest first.
declare function pickRecordRun(
  record: { sequence: number; taskRunID?: string },
  runs: readonly TaskRun[],
): TaskRun | null;
// The only reader that applies pickRecordRun.
declare function readRunRecords(
  context: Pick<TasksContext, 'log'>,
  run: TaskRun,
  kinds: readonly RecordKind[],
): Promise<readonly LogRecord[]>;
```

### What a runner, a tool call and a meter see

```ts
// tasks module
interface StepInput {
  // …existing fields
  run: TaskRun | null; // null for a task with no task run, such as the conversation
}
interface StepResult {
  // …existing fields
  run?: {
    activity: 'worked' | 'none';
    limit?: { meter: 'turns' | 'dollars'; used: number; limit: number };
  };
}

// tools module, set per step beside stepRunID. The tools module imports nothing from the tasks module.
interface ToolRun {
  // …existing fields
  taskRun?: { runID: string; calls: Record<string, number> }; // calls: the run's limits.calls, passed through
}

// tasks module. The server builds it once and passes it to the claim, the start and the seed.
interface RunSettings {
  reportDefaults: { start: TaskReport; definition: TaskReport }; // { start: 'wake', definition: 'next_turn' }
  meters: readonly [RunMeter, RunMeter]; // the sessions module's turns and dollars
}
interface RunMeter {
  name: 'turns' | 'dollars';
  read(context: Pick<TasksContext, 'log'>, run: TaskRun): Promise<number>;
  render(limit: number): string; // "$10.00", "40 turns"
}

pickReportMode(undefined, 'definition', settings); // → 'next_turn'
declare function pickReportMode(
  given: TaskReport | undefined,
  from: 'start' | 'definition',
  settings: RunSettings,
): TaskReport;
```

## Constraints

### Opening a task run

- A task run is pending, then open, then ended. The projection has a row only from the claim, so
  `readRunState` works out `pending` from the task's unread waking input.
- A started task has a pending task run when it has unread waking input and no open task run. Its
  brief record is its first waking input.
- At the claim of a step of a task with no open task run, nixie opens a task run. For a started
  task, the unread waking input is what it opens for. Its `origin.kind` is `start` for the brief,
  and otherwise follows the cause that the built `buildStepWake` picks: `message` for a task
  message, `owner` for your message, `timer` for a timer and `event` for an outside event. For a
  definition's task, the definitions design's `pickRunDefinition` decides, and its
  [list](../definition-tasks.md#what-opens-a-task-run) puts an unread fire first, then a raise or a
  restart, then an unread message.
- For a started task, a claim checks the limit hold, then a raise or a restart, then the unread
  waking input. A carried task run reads the unread input in its first step.
- A claim for a task with an open task run runs the step in it, whether the step is a rerun or a
  waking message caused it.
- When a claim finds an idle task run and an unread `trigger.fired` record whose dedupe key differs
  from the task run's `triggerKey`, nixie ends the idle task run with `no_report` and opens the next
  one in the same transaction.
- When a claim finds the limit hold and no open task run, nixie pauses the task and opens no task
  run. The claim checks the limit hold before it checks a raise, a restart or `pickRunDefinition`.
- `task.run_opened` pins the report mode, the report target, the report shape and the limits, and
  every reader reads those 4 values from it. A change to a definition therefore applies from the
  next task run.
- `report.target` is the starter for a started task and the conversation for a definition's task
  run, and null only under the mode `none`.
- A unique partial index allows at most one open task run per task.
- A rerun of a first step opens no second task run, and a rebuild of the projection gives the same
  rows.

### Which task run a record belongs to

- A step writes `tool_called`, `tool_result` and `task.failed_turn_spent` with no lease check, so
  only they can land after their task run ended, and only they carry `taskRunID`.
- `pickRecordRun` returns the task run that a record's `taskRunID` names. With no `taskRunID`, it
  returns the task run whose `origin.sequence` is the record's sequence, so the waking input belongs
  to the task run it opened. Otherwise it returns the newest task run opened at or before the record
  and not ended before it, or null.
- A record between one task run's end and the next one's open, such as a message that lands after a
  report, belongs to no task run until a claim opens one for it.
- Every count of a task run's use reads through `readRunRecords`.
- A runner never writes one of the 3 kinds and never writes the limit hold. A runner with no model
  ends a task run by returning `StepResult.run.report`, and the commit writes
  `task.run_report_requested` from it, as
  [the coding session runner](../coding-session-runner/runner.md#what-one-step-does) sets out.

### Ending a task run

The end writer, `writeRunEndInTransaction`, is the one function that ends a task run, and the tasks
module does not export it. When a step commits, nixie takes the first row that applies.

These rows end the task run:

| The commit finds                                   | End cause   | The task's next state                         |
| -------------------------------------------------- | ----------- | --------------------------------------------- |
| a report request, or `StepResult.run.report`       | `reported`  | what the step asked                           |
| a reached limit in `StepResult.run`                | `limit`     | `paused`, under the limit hold                |
| the runner returned `done`                         | `no_report` | `done`, and `waiting` for a definition's task |
| a first step with `StepResult.run.activity` `none` | `no_work`   | `waiting`                                     |
| a quiet turn, and the task is not wakeable         | `no_report` | `waiting`                                     |

These rows leave the task run open, and the task takes the next state the step asked for:

- more work queued for the task, including a turn that an interrupt cut, which keeps its built
  `isInterrupted` mark;
- an open wait for a reply to a message the task sent, or an open event wait
  ([mail and calendar polls](../mail-and-calendar-polls.md#event-waits));
- a quiet turn, when the task is wakeable.

- Until [the wake rule](https://linear.app/zgeoff/issue/GEO-1865) renames it, "wakeable" reads the
  built `TaskProfile.isWokenByMessages`.
- A started task that reported waits and is wakeable. It is never `done`, because a `done` task
  refuses messages and has no sandbox.
- A definition's task is never `done`, because it keeps one thread for the life of its definition,
  as [the task of a definition](../definition-tasks.md#between-task-runs) gives.
- A started task that reported keeps its sandbox, asleep, as the built sandbox rules do for every
  waiting task, until you close the task.
- Your stop ends the task run with `stopped` and your close with `closed`, each in the transaction
  that writes the control. A step error that fails the task ends it with `failed` in that error's
  transaction.
- When a step's task run holds a report request, `runTaskStep` commits the step with no further
  model turn, for every runner.
- When the lease of a step that called `task.report` expires, the rerun does no work, and its commit
  sends the first summary and fields under the first `reportID`.
- A stale step's lease check fails at its commit, so it ends no task run.
- When the ending transaction throws, the task run stays open, and the caller's retry ends it.
  Recovery ends no task run: the rerun of the step joins the open one.
- When the task has no open task run, the end writer writes nothing.

### Delivering the report

In the ending transaction, the end writer takes the first row that applies:

| The case                                          | What nixie writes                                | `delivery`  |
| ------------------------------------------------- | ------------------------------------------------ | ----------- |
| the end cause is `no_work`                        | no message                                       | `kept`      |
| the report target is `done`, `failed` or `closed` | no message                                       | `kept`      |
| the mode `none`                                   | no message                                       | `kept`      |
| the mode `next_turn`                              | a `task_message` of kind `report`, `wake: false` | `next_turn` |
| the mode `wake`, past the hop limit               | a `task_message` of kind `report`, `wake: false` | `next_turn` |
| the mode `wake`, inside the hop limit             | a `task_message` of kind `report`, with a wake   | `wake`      |

- Row 2 covers the 3 states that the built `isFinishedState` gives, because
  `writeInboxRecordsInTransaction` throws on a message to a task in one of them.

- The delivered message goes from the task to the report target, with the `reportID` as its message
  ID and the body of `task.run_ended`.
- The hop of an end that a step commits is the hop of that step's lease, read through the built
  `readLeasedStepHop`.
- An end that commits no step, such as a stop, a close, a failure or a claim's end of an idle task
  run, takes the hop of the task's newest step, the built `tasks.step_hop`, and delivers under the
  same rows.
- A kept report exists only on `task.run_ended`. nixie writes no message on the task's own thread,
  because the task would read it as input.
- This work deletes the built `planTaskReport` and its refusal: a `task.message` of kind `report`
  sent during a task run is an ordinary message that keeps its own `wake`, and ends nothing. The
  report mode binds only the report that the end writer delivers.
- nixie never treats a report as a message from you.

### Limits, a raise and call caps

- `turns` and `dollars` are meters. Before each step, nixie reads each meter that the runner's
  definition lists against the open task run's `limits`. A meter at its limit makes the step run no
  turn and ends the task run with `limit`.
- The pre-step read skips `calls`. A call past its cap is denied, and the task run goes on.
- The turns meter counts the task run's `model.turn_ended` records. The dollars meter applies the
  built count rule of `readTaskUsage` to the task run's records from `readRunRecords`, so a limit
  record counts the dollars past the records before it unless its step's commit carried a turn
  record, and a hold's dollars count once after a lost lease.
- [The late-spend fix](https://linear.app/zgeoff/issue/GEO-2495) lands first and changes what
  `readTaskUsage` returns. This work then moves its count rule into the dollars meter.
- During a turn, the late-spend read counts only the spend records whose `taskRunID` is the open
  task run's, past the sequence of the turn's usage read.
- During a turn, the nixie runner interrupts the turn at its turn budget and returns the reached
  dollar limit in `StepResult.run`. The nixie runner no longer calls `writeTaskLimitPause`.
- At a `limit` end, the end writer writes in the commit's transaction what the built
  `writeTaskLimitPause` writes: the `pause` control, the built `task.limit_reached` payload
  `{ taskID, stepKey, used, limits }` with the piece of work's turns and dollars, and the limit
  notice. `used` is the piece of work's use since its newest restart, and `limits` its totals, so
  the value of a raise is a new total. The notice still skips a starter that is gone or finished, as
  built.
- When the limit end's report wakes the report target, nixie writes no limit notice. Otherwise nixie
  writes it, and the notice wakes the starter.
- The built spend writes stay: a failed turn, or a turn whose commit fails, writes
  `task.failed_turn_spent` with its dollars. A commit that loses its lease writes no hold, and the
  rerun's meter read before its step ends the task run with `limit`.
- The claim opens one carried task run when the task's newest task run ended with `limit`, `stopped`
  or `failed` and a raise or a restart is newer than that end. Its `origin.sequence` is that control
  record, and it copies `triggerKey`, `briefID`, `reportShape` and `definitionHash`.
- A meter's total for a piece of work is the value of the newest raise that names the meter, or else
  the first task run's pinned value.
- After a raise, each carried limit is the meter's total less the piece of work's use of that meter
  since its newest restart, and never below 0.
- After a restart, each carried limit is the meter's total, with nothing taken off.
- A carried task run copies the first task run's `calls`, and each cap counts only the carried task
  run's own calls, because the tools module counts by `taskRunID`.
- For example, a task run pinned at 40 turns and $10 ends with `limit` at 40 turns after $3. A raise
  to 60 turns carries it with 20 turns and $7. It ends with `limit` again at 60 turns after $2 more,
  and a raise to 80 turns carries it with 20 turns and $5. A restart then carries it with 80 turns
  and $10. A test of the projection pins these values.
- Once the carried task run ends, its end is newer than the control record, so no later claim opens
  a second one, after a server start or recovery included.
- The tools module counts a tool's calls in a task run from its own `tool_called` and `tool_result`
  records whose `taskRunID` is `ToolRun.taskRun.runID`, so it imports nothing from the tasks module.
- When a call would be one more than its cap, nixie denies it and the tool does not run. A call
  counts when its outcome is `result`, `queued` or `unknown`, or while it has not returned.
  `invalid`, `denied`, `error` and `failed` never count.
- The seed refuses a definition whose `maxCalls` names a tool its `tools` lack, or sets a cap below
  1, through a function the tools module exports.
- A call cap needs no approval of yours, because it only narrows what a task run may do.

### The release before

- The release before drops `taskRunID` and `options.reportShape` on decode, and its tasks projection
  skips a kind it cannot parse.
- The release before reads the `pause` control, `task.limit_reached` and the limit notice that a
  `limit` end writes, because they keep their built payloads, so its raise path works on a task this
  release paused. Its own runner calls `writeTaskLimitPause` again after a rollback.
- The release before skips each definition that holds `reportShape` or `maxCalls`, so it never runs
  without its caps, and logs a warning that names the definition and the field.

## Decisions

- **Limits count per task run, and a raise sets a total for the piece of work.** A limit bounds one
  piece of work, not the life of a task.
- **One end writer ends every task run and writes its report.** A task that started work always
  learns how it ended.
- **A report of a definition's task run defaults to `next_turn`.** A scheduled task run with `wake`
  would spend a conversation turn on each fire.
- **A call cap denies the call and never pauses the task.** A cap narrows one tool, so the rest of
  the work can go on.
- **The cap denial uses the outcome `denied`.** The outcomes are a closed list, and a release that
  lacks an outcome fails to decode the record.
- **For a definition's task, an unread fire opens a task run before a raise or a restart, and a
  raise or a restart before an unread message.** An agent's call on 13 Nov, which the owner
  accepted: a fire can be unread at a carry only after a stop of an idle task run, which has nothing
  to carry, while a message after a `limit` end belongs to the work that the raise carries on.
- **A raise carries the piece of work's total less its use, and a restart carries the full totals.**
  An agent's call on 13 Nov, which the owner accepted: under one rule for both, a restart after a
  limit end would carry 0 turns and end before its first turn.
- **A report to a target whose listed state is `finished` is delivered under its report mode.** An
  agent's call on 13 Nov, which the owner accepted: the starter asked for the result, a `finished`
  task accepts messages, and the hop limit bounds the wake.
- **The late-spend read counts only the open task run's records.** An agent's call on 13 Nov, open
  to the owner's veto: limits count per task run, so another task run's spend never shortens this
  one's turn.
- **An end with no leased step takes the hop of the task's newest step.** An agent's call on 13 Nov,
  which the owner accepted: a stop then wakes the starter whenever the task run's own hop allows it,
  and never resets a loop's hop count.

## Builder decides

- Internal names, the end writer's parameters, and how `readRunRecords` bounds a task run.
- The wording of the 2 `maxCalls` seed refusals. Each names the file and the key.
- The file name that `start-task-runners.ts` takes after the rename.
- Test layout.

## Out of scope

- A hook for another module to write in the ending transaction.
- An ordinal or a short ID for a task run.
- Parsing a definition file, `pickRunDefinition` and the `trigger` block: the task definitions
  design owns them.
- A close of a started task that reported. Its sandbox sleeps until you close it.

## Open questions

None.
