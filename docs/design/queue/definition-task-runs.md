# Task runs of a definition

A fire of a definition's trigger opens a task run on the definition's task, or nixie skips the fire.
This doc covers the 2 records of a fire, what opens a task run, what nixie decides for each fire,
and what the model reads about the fire. The rules have 2 aims: one definition never has 2 task runs
at once, and each task run uses the definition version of the fire that opened it.

The sketches in `sketches/definitions/` hold the type shapes and the texts of the refusals and
notices that have a text. This doc holds the rules. An item marked `(open: <name>)` is not settled,
and [the open list](open/definitions.md) holds it. The section "Built" describes the code as it is.
Every other section describes the design.

The [glossary](../../glossary.md) defines task, task run, inbox, trigger, lease, notice and
untrusted.

Terms from other docs:

- [Task definitions](task-definitions.md) defines task definition, definition hash, in force and
  step. It covers the keys `target` and `context`.
- [The task of a definition](definition-tasks.md) defines definition's task, hash in force and
  session boundary.
- [Schedules](schedules-and-triggers.md) defines schedule and one-shot.

Terms this doc adds:

- **Fire.** One event of a trigger for one definition, such as one scheduled time of a schedule.
- **Slot.** One scheduled time of a schedule.
- **Dedupe key.** The text that identifies one fire. [The trigger core](trigger-core.md) covers it.
  A task run stores the dedupe key of its fire as `triggerKey`.
- **Catch-up.** A fire that nixie delivers after its scheduled time.
- **Skip.** A fire that opens no task run. nixie records it as `trigger.skipped`.
- **Pending task run.** A task run that the next claim opens. The usual case is a fire that nixie
  wrote as `trigger.fired` and that no claim has turned into a task run.
- **Open task run.** A task run that a claim opened and that has not ended. It is active, waiting on
  a reply, or idle. [Task runs and reports](task-runs-and-reports.md) owns these states.
- **Pinned version.** The definition hash that a task run holds from its opening to its end.
- **Carrying task run.** A task run that goes on with the work of an ended task run.

Related docs:

- [Task runs and reports](task-runs-and-reports.md) owns the task run, the claim, the record
  `task.run_opened` and its member `origin.kind`.
- [Task run limits](task-run-limits.md) owns the limit of a task run and the raise of a limit.
- [The task brief](task-brief.md) owns the brief and the order of a task run's first input.
- [Task messages](task-messages.md) owns the message envelope.

## Built

This section lists the built code that the design uses or alters.

- `isInboxRecord` returns true for an inbox record kind. It accepts 6 kinds.
- A wake of a task holds a cause. `event` is one of the causes.
- The decision point is the code that allows or denies each tool call. Its rule `slice1.read-only`
  allows only the effects `read`, `fetch` and `note`.
- `runTaskStep` commits a step with `hold` when the step has no input to read.

## The 2 records of a fire

The shapes are in [`trigger.fired` and `trigger.skipped`](sketches/definitions/02-types.ts), section
E.

- nixie writes `trigger.fired` for a fire that it takes, and `trigger.skipped` for a skip.
- The tasks module registers both record kinds.
- For a definition with `target: task`, nixie writes both records on the thread of the definition's
  task.
- For a definition with `target: conversation`, nixie writes both records on the conversation's
  thread.
- `trigger.fired` is an inbox record. When nixie writes it, the definition's task or the
  conversation wakes, with the cause `event`.
- `trigger.fired` holds the definition hash of the fire. A task run that the fire opens pins that
  hash.
- `trigger.fired` holds the scheduled times that nixie skipped since the fire before it, oldest
  first. It lists at most 20, and `skippedCount` holds their full number.
- `trigger.skipped` is not an inbox record, and it wakes no task.
- `trigger.skipped` holds the scheduled times that it covers. It lists at most 20, and `count` holds
  their full number.
- `trigger.skipped` holds one of 5 reasons. This doc covers `still_running` and `task_held`.
  [Schedules](schedules-and-triggers.md) covers `too_late`, `catch_up_off` and `window_closed`.
- nixie writes no record for a fire of a disabled definition, so the reasons do not include
  `disabled`.
- A fire of a `poll` trigger carries a payload from an outside system. `trigger.fired` holds it in
  an erasable field, and the payload is untrusted.

## What opens a task run

The tests as code are in [`pickRunDefinition`](sketches/definitions/03-flow.ts), section B. The
result type is in [the pick](sketches/definitions/02-types.ts), section F.

When a claim finds no open task run on a definition's task, it calls `pickRunDefinition`. The
function tries 4 tests in order, and the first that passes decides.

1. **An unread fire.** The inbox holds an unread `trigger.fired` record, and no task run of the task
   has its dedupe key. The claim opens a task run with `origin.kind` `trigger`. The task run pins
   the definition hash of the fire.
2. **An unread message.** The inbox holds an unread message that wakes the task, and the hash in
   force is not null. The claim opens a task run with `origin.kind` `message`. The task run pins the
   hash in force.
3. **A raise or a restart.** The last task run ended with the cause `limit`, `stopped` or `failed`,
   and after that end you raised the task's limit or restarted the task. The claim opens a carrying
   task run with `origin.kind` `raise` or `restart`. It pins the hash of the ended task run.
4. **None of these.** The claim opens no task run. A resume, a server start, a recovery, and a
   message while the hash in force is null all end here.

Rules for the 4 tests:

- The claim itself also checks a raise, a restart and the limit hold. How those checks and these 4
  tests are ordered is the open item "claim order" in [the tasks open list](open/tasks.md).
- `pickRunDefinition` is pure. Its input is the task's row, the unread inbox records, the control
  records and the last task run.
- Test 1 does not read the hash in force. A one-shot therefore gets its task run, although its own
  fire puts it out of force.
- A carrying task run resumes the model session of the ended task run. It does so under
  `context: fresh` too.
- A carrying task run copies the `triggerKey` and the `briefID` of the ended task run. Its
  `carriesRunID` is the ID of the ended task run.
- Which code makes the `briefID` of any other task run is the open item "briefID maker" in
  [the tasks open list](open/tasks.md).
- Under test 4, the step calls no runner and reads no input. `runTaskStep` commits it with `hold`,
  and the task's state is `waiting`. An unread message in the inbox is unread after the step.

Rules for a claim that finds an open task run:

- When the open task run is active or waiting on a reply, the step runs inside it.
- When the open task run is idle and the inbox holds an unread fire with another dedupe key, the
  claim ends the idle task run with the cause `no_report`. It opens the task run of the fire in the
  same transaction.

Rules for every task run of a definition:

- Under `context: fresh`, each task run opens a model session of its own. A carrying task run is the
  one exception. Under `context: continuing`, each task run resumes at the session boundary.
- nixie starts every task run of a definition as untrusted. Each of its tool calls goes through the
  decision point, so the task run can call only tools with the effects `read`, `fetch` and `note`.

## What nixie decides for a fire

The tests as code are in [`readDefinitionTaskInTransaction`](sketches/definitions/03-flow.ts),
section C.

`readDefinitionTaskInTransaction` decides each fire of a `target: task` definition. It returns null
when no task is bound to the definition, and [the trigger core](trigger-core.md) covers that case.
Otherwise it returns one of 3 answers. The first test that passes decides.

1. **`held`.** The task's state is `paused`, `stopped` or `failed`, or the task is held at its
   limit. nixie writes `trigger.skipped` with `task_held`. The definition fires again at the first
   slot after you resume the task, restart it or raise its limit.
2. **`still_running`.** The task has a pending task run, or an open task run that is active or
   waiting on a reply. nixie writes `trigger.skipped` with `still_running`. The definition fires
   again at the first slot after that task run ends.
3. **`take`.** The task has no pending task run, and its open task run is idle or absent. nixie
   writes `trigger.fired`, and the task wakes. The claim ends an idle task run and opens the task
   run of the fire.

Rules for the 3 answers:

- A task under a recovery hold gets `held` (open: recovery hold fire).
  [Backup and recovery](backup-and-recovery.md) owns the recovery hold.
- nixie calls `readDefinitionTaskInTransaction` inside the transaction that delivers the fire,
  before it writes the record of the fire. nixie therefore writes `trigger.fired` only for a fire
  that the task takes.
- The function reads 5 things: the `tasks` row, the limit hold, the recovery hold, the unread inbox
  records and `readRunState`.
- The table of task runs has no row for a pending task run. The function therefore computes whether
  one exists.
- For a task with no open task run, a task run is pending when `pickRunDefinition` passes test 1, 2
  or 3.
- For a task with an idle open task run, a task run is pending when the inbox holds an unread fire
  and no task run has its dedupe key.
- A task therefore holds at most one unread `trigger.fired` record, however late the claim comes.
  This holds whether or not the task is wakeable.
- One exception exists. After you stop a task, its inbox can hold 2 unread `trigger.fired` records.
  The claim opens the task run of the newest one. The first step marks both as read and renders only
  the newest.

Why nixie skips and does not queue:

- A queue of fires would hide a task run that never ends.
- Two task runs at once would write to one thread.
- A task that was held for a week does not run the fires of that week. Each got a skip with
  `task_held`, and the trigger report shows them.
- One fire can predate a hold: nixie wrote it as `trigger.fired` before the hold began, and the task
  did not read it. When the task can run again, that one fire opens a task run, however old it is.
  Its `trigger` block gives the scheduled time and the start time.

## The `trigger` block

The shape and an example sentence are in [`TriggerDetails`](sketches/definitions/02-types.ts),
section G.

- The claim builds the trigger details from the `trigger.fired` record that opened the task run.
- nixie renders the details as one `<input>` block named `trigger`, in the first input of the task
  run. [The task brief](task-brief.md) owns the place of the block in that input.
- nixie does not render the details in the prompt. The prompt of a definition's task is the same at
  every task run of one definition version.
- The block gives each time as a local time with its offset, in the zone of the definition's
  schedule.
- The block lists at most 20 skipped times, oldest first, and their full number.
- The block holds one sentence that code builds from the other members.
- A task run that a message opened has no `trigger` block.
- A carrying task run shows the `trigger` block of the fire that opened the first task run of the
  work.
- `instructions.md` cannot hold a placeholder for a value of the block.

## The reminder in the conversation

The message type and its text are in [the `reminder` message](sketches/definitions/02-types.ts),
section G.

- A definition with `target: conversation` is a reminder. Its `brief` is the text of the reminder,
  and the agent wrote it.
- When nixie writes `trigger.fired` on the conversation's thread, the conversation wakes once.
- nixie renders the record as a system message of the type `reminder`. The wire lib defines the
  type.
- The message holds the brief and the scheduled time. For a catch-up, it also holds how late the
  fire is (open: notice text).
- nixie renders the message in the envelope for a notice from nixie, which
  [task messages](task-messages.md) defines.
- Inside the message body, the brief is in a block of its own. The envelope marks that block as text
  of the model, so the model does not read the brief as words of nixie.

## When nixie dies

- When nixie dies after it committed a fire and before a claim, the task's state is `ready` and the
  fire is unread. The claim after the restart opens the task run of that fire, by test 1.
- When nixie dies inside a step, the task's lease expires. The rerun of the step runs inside the
  open task run.
- When a claim after a restart finds no open task run and no unread input, test 4 applies.

## Not in scope

- The code that produces fires, which [schedules](schedules-and-triggers.md) and
  [the trigger core](trigger-core.md) cover.
- The record `task.run_opened`, the report modes and the report shape, which
  [task runs and reports](task-runs-and-reports.md) covers.
- A bypass of `slice1.read-only` for the tools that a definition lists.
- A way to start a definition that has no trigger.
