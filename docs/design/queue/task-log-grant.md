# The log grant of a task

This doc covers the log grant: the option that lets a task read the conversation's thread of the
event log through the tool `log.read`. A task with the log grant reads the conversation's thread. A
task without the log grant reads only its own thread. The log grant exists for a task that needs
your messages, such as a task that takes notes from them. Every other task has no access to your
messages. [Decision 0051](../../decisions/0051-memory-tools-on-tasks.md) records the choice.

This doc holds the rules. The sketches are the TypeScript files in `sketches/tasks/`: they hold the
type definitions and the exact text of the refusal, and the sections "The option" and "Who may give
the log grant" link them. Terms that this doc does not define are in the
[glossary](../../glossary.md) and in the Terms section of [task runs](task-runs-and-reports.md),
which defines step, started task and starter. An item marked `(open: <name>)` is not settled.
[The open list](open/tasks.md) gives each item by that name.

## Terms

- The **conversation** is your chat with nixie. It is a task that never closes.
- A **start** is one `task.start` call, the tool call by which a task's model starts another task.
  The **start input** is the input of that call.
- A **task definition** is a task that your definitions declare. Its definition file carries the
  keys of the start input. The **seed** is the load of your definitions.
  [Task definitions](task-definitions.md) describes both.
- A task's **options** are the keys of the start input that nixie stores for the task: among them
  `memory`, `persona` and `log`.
- The **log grant** is the option `log` with the value `conversation`. A **granted task** is a task
  with the log grant.
- The **start check** is `planTaskStart`, the one function that accepts or refuses a start. A
  **bound** is one rule of the start check that compares what the start asks for with what the
  starter has.
- A **tool run** is the set of facts that every tool call of one step receives: the type `ToolRun`.

## Built

This section describes the code as it is before this design is built. Where a section after it
differs, the design replaces the built behaviour.

- `log.read` reads the thread in the `thread` field of its tool run. For a task, that thread is the
  task's own thread.
- `planTaskStart(choice, starter, bounds)` is the start check. Its `starter` argument carries the
  tools, the `memory` option and the `persona` option of the starter.
- A start stores the options of the started task in the `task.created` record of that task.
  `readTaskSetup` reads them back.
- In each turn, nixie searches past messages for text that matches the turn. That search calls
  `recallMessages` and passes no thread.

## The option

Usage: [a start with the log grant](sketches/tasks/01-usage.ts), section F. Types:
[the `log` option](sketches/tasks/02-types.ts), section L.

- `log` is a member of the start input, beside `memory` and `persona`. Its values are `own` and
  `conversation`.
- A definition file accepts `log` as well, because a definition file carries the keys of the start
  input.
- When a start or a definition file has no `log` key, the task gets `own`.
- The tasks module owns the option and its bound.

## Who may give the log grant

- The conversation counts as a granted task when it is the starter.
- The start check accepts a start with `log: conversation` when the starter is a granted task.
- The start check refuses a start with `log: conversation` when the starter is not a granted task.
  Text: [the refusal](sketches/tasks/02-types.ts), section L.
- A chain of starts can therefore pass the log grant on, and a task without it can never give it.
- A definition file in your definitions may set `log: conversation`, as it may list any registered
  tool. You wrote the definition file, so it needs no granted starter.
- Which starter the seed passes to the start check is not settled: see
  [the definitions open list](open/definitions.md).
- The start check accepts a start that has both the log grant and a tool that sends data outside
  nixie. The design has no rule against that pair.

## The read

- `log.read` has the same input for a task with the log grant and a task without it.
- The tool run has a field `logThread`. `log.read` reads the thread in `logThread`.
- For a task with `log: own`, `logThread` is the task's own thread. For a granted task, `logThread`
  is the conversation's thread.
- For each step, the code that runs the step sets `logThread` from the options of the task. nixie
  stores `logThread` in no record.
- The `thread` field of the tool run is the task's own thread in both cases.
- The `tool_called` record and the `tool_result` record of a granted task's `log.read` call are
  therefore on the task's own thread.
- Each record that `log.read` returns to a granted task has the same source label as on the
  conversation's thread. A message from you is returned as a message from you.
- The tool run of a worker has the `logThread` of the task that called the worker. A worker
  therefore reads the same thread as its caller. [Task workers](task-workers.md) describes a worker.
- The memory module owns `log.read`.

## What nixie stores

- A start stores the value of `log` in the options of the `task.created` record of the started task.
- The seed stores the value of `log` with the version of the task definition:
  [task definitions](task-definitions.md).
- When a stored record has no `log` key, nixie reads the value as `own`.
- When a stored `log` value is neither `own` nor `conversation`, the decode of the task's options
  fails, as for any invalid option.
- `readTaskSetup` returns the value of `log` for a started task.
  [The task runner port](task-runner-port.md) defines the type that it returns.

## What is not checked

- The design relies on one fact: the search over past messages in each turn returns no message of
  the conversation to a task. If that search returns one, a task without the log grant can read your
  messages. Nobody has checked the fact. (open: retrieval and the grant)
- A granted task can save a memory with a quote from the conversation's thread.
  [The memory write gate](memory-write-gate.md) decides on which thread it looks for that quote, and
  that rule is not settled. (open: gate quote thread)

## Not in scope

The design has none of these:

- A rule that refuses the log grant beside a tool that sends data outside nixie.
- A read of the thread of another task.
- A tool other than `log.read` that reads the conversation's thread.
- A change to the search over past messages.

Other docs own these:

- Task messages in the result of `log.read`: [the report shape](task-report-shape.md).
- The example task definition that takes notes from your messages.
