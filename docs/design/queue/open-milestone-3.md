# The open list: milestone 3

The items that block a build of milestone 3. 49 items block a build, and 11 of them are yours.
[The open list](open.md) explains the kinds and the marks, and holds the other milestones.

- [claim order](open/tasks.md#not-decided) (yours): Which comes first in a claim: the raise or
  restart and the limit hold, or `pickRunDefinition`?
- [finished target](open/tasks.md#not-decided) (yours): Is a report target that "has finished"
  closed or `done`, or in the listed state `finished`?
- [previous start block](open/tasks.md#not-decided) (yours): What are the name and exact text of the
  block for the previous task run's start?
- [carried start time](open/tasks.md#not-decided) (yours): Which start time does a carried task run
  get?
- [seed check order](open/tasks.md#not-decided) (yours): Which family's slice lands first: the tasks
  checks that the seed calls, or the definitions functions that tasks calls? Intended: tasks slice 3
  passes with started tasks only, and the definitions slices call its exports.
- [rule format rename](open/definitions.md#not-decided) (yours): Does the rule format rename `jobs`
  to `definitions` and `job` to `task`?
- [runner key](open/definitions.md#not-decided) (yours): Does a definition hold a `runner` key, or
  does every definition use the nixie runner?
- [seed starter](open/definitions.md#not-decided) (yours): Which starter and bounds does the seed
  pass to `planTaskStart` for a definition? Intended: a starter that may list any registered tool
  and holds the `log` grant; its other values are not stated.
- [retireOneShot order](open/definitions.md#not-decided) (yours): Which lands first: `retireOneShot`
  of the schedule source, or the `definition.settled` record of the runtime layer? Intended: slice 6
  ships `retireOneShot` for repo definitions, and slice 9 adds the record.
- [moment guide page](open/definitions.md#not-decided) (yours): Does the moment reflection example
  get a guide page? Intended: no page.
- [ended task runs name](open/definitions.md#not-decided) (yours): Are the procedure and the route
  for ended task runs named with "finished" or with "ended"?
- [newer log replay](open/tasks.md#not-checked): Does the last release read a log with this family's
  records and keys?
- [object arguments](open/tasks.md#not-checked): Does each model runtime pass a free-form object
  argument unchanged?
- [validator text](open/tasks.md#not-checked): Does the validator's error text hold no value of the
  input, and does it skip an unknown keyword?
- [forget session cleanup](open/tasks.md#not-checked): Does a record forget invalidate a started
  task's session and its starter's?
- [retrieval and the grant](open/tasks.md#not-checked): Does a task with `memory: read` get no
  conversation message from the per-turn search?
- [log.read edge](open/tasks.md#not-checked): Do `to` and `from` at one time split a thread with no
  gap and no repeat?
- [batch cut wake](open/tasks.md#not-checked): Does a step that leaves unread input behind the batch
  cut get its next turn with no wake?
- [rebuild replays by thread](open/tasks.md#not-checked): Does a session rebuild replay
  `tool_called` by thread?
- [code-made report ID](open/tasks.md#not-written): Which `reportID` does a code-made report get?
  Intended: the writer of an end makes a short ID.
- [undefined task types](open/tasks.md#not-written): What are the definitions of `EnvelopeView`,
  `RunSettings`, `TaskPolicy`, `RunSpan`, `SessionWindow` and the 5 worker plan types?
- [raise limits pin](open/tasks.md#not-written): How does the claim compute and pin the raised
  limits minus what the ended task run used? Intended: a raise means a total for the piece of work.
- [starter label](open/tasks.md#not-written): What text does `{starter label}` have for a
  definition's task run and for the report mode `none`?
- [briefID maker](open/tasks.md#not-written): Which code makes the `briefID` of a definition's task
  run?
- [worker config sentences](open/tasks.md#not-written): What are the 3 config refusal sentences of a
  worker? Intended: the minutes sentence gives both figures, and the null-wait sentence gives the
  harness.
- [label task ID](open/tasks.md#known-faults): Does every label hold the sender's task ID, the
  conversation's label and a `persona: none` label included? Intended: the label table, which gives
  the conversation's label no ID.
- [nextRunAt source](open/tasks.md#known-faults): Which code gives the tasks module the next fire of
  a schedule, for `nextRunAt`?
- [definition task next state](open/tasks.md#known-faults): Is the next state of a definition's task
  `done` or `waiting`, when the runner returns `done`?
- [definitions imports tasks](open/definitions.md#not-checked): May the definitions module import
  the tasks module?
- [triggers imports](open/definitions.md#not-checked): Do the imports of definitions on triggers and
  of triggers on tasks pass `bunx turbo boundaries`?
- [old client trigger.fired](open/definitions.md#not-checked): How does the web client of the last
  release show a `trigger.fired` record?
- [old client definition.changed](open/definitions.md#not-checked): How does the web client of the
  last release show a `definition.changed` record?
- [start input schema](open/definitions.md#not-written): Which exported, strict schema is the
  `task.start` input that `TaskDefinition` builds on? Intended: `parseTaskStartInput` of the task
  runner port.
- [version table columns](open/definitions.md#not-written): Which columns does
  `task_definition_versions` hold? Intended: `definition_hash`, `definition_id`, `form` and `files`.
- [hook context](open/definitions.md#not-written): How does the definitions module get the tasks
  context for `writeDefinitionTasksInTransaction`? Intended: the server app passes it in.
- [first enabled time](open/definitions.md#not-written): Which record carries the time at which a
  definition was first enabled? Intended: the first `task.definition_set` record of the definition's
  task that holds a hash.
- [notice text](open/definitions.md#not-written): What text do the `definition.changed` notice and
  the `reminder` message have in the cases without one?
- [undefined types](open/definitions.md#not-written): What are the definitions of
  `DefinitionChangeResult`, `DefinitionMove`, `TaskSeedPlan` and `listedTask`?
- [view details](open/definitions.md#not-written): What are the 4 unwritten details of the views?
- [decider clock](open/definitions.md#not-written): How does the pure `pickDefinitionMove` get the
  time for `ONE_SHOT_PAST`? Intended: the caller passes the time in.
- [example instructions text](open/definitions.md#not-written): What is the `instructions.md` text
  of each example?
- [undo output](open/definitions.md#known-faults): Does the undo return `restored: 'repo'` beside
  `{ definitionID, changeID }`? Intended: `restored` is an optional member.
- [ID casing](open/definitions.md#known-faults): Do the tools spell `definitionId` and `changeId`,
  or `definitionID` and `changeID` as the records and the API do? Intended: each as its source
  spells it.
- [resolve command](open/definitions.md#known-faults): Which command resolves a conflict of a task
  definition?
- [cross-thread evidence](open/memory-gate.md#not-checked): Does the built gate find an event that a
  task cites from the conversation's thread?
- [log grant tests](open/memory-gate.md#not-written): Which tests cover a granted task's cited
  quote? Intended: the cases in slice 7.
- [gate quote thread](open/memory-gate.md#known-faults): Does the gate read a cited event on the
  tool run's `logThread`, or on the task's setup? Intended: `logThread`, and the setup for a save in
  a step after the change.
- [agent-sdk tool-call timeout](open/harnesses.md#not-checked): Does the Agent SDK runtime obey a
  setting for the timeout of one MCP tool call?
- [wait milestone](open/harnesses.md#known-faults): Do harness slices 1 and 2 land in milestone 3
  with the worker tool, or in milestone 4? Intended: with the worker tool.
