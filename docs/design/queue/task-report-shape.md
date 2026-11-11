# The `task.report` call and the report shape

This doc covers how a task's model ends its task run with `task.report`, and how a task declares
what its report carries beside the summary. A task run is one stretch of a task's work that ends in
one report. A report shape is the set of fields that a task declares for its report. nixie checks a
report against the report shape, so code and people that read the report can rely on its fields.
[Decision 0055](../../decisions/0055-the-report-shape-of-a-task.md) records the choice.

This doc holds the rules. The sketches are the TypeScript files in `sketches/tasks/`: they hold the
type definitions and the exact texts, and each section here links the part it uses. Terms that this
doc does not define are in the [glossary](../../glossary.md) and in the Terms section of
[task runs](task-runs-and-reports.md). An item marked `(open: <name>)` is not settled.
[The open list](open/tasks.md) gives each item by that name, with what is not settled.

## Terms

- A **step** is one claimed unit of a task's work, and a **lease** is the step's claim, which
  expires. [Tasks](../../architecture/core/tasks.md) describes both.
- The **start input** is the input of a `task.start` call: the name, the brief, the tools and the
  options of the task to start.
- A **definition file** is the `task.yaml` of a task definition in your definitions. It carries the
  same keys as the start input, and more. `task.define` is the tool that writes a definition from
  chat, and it accepts fewer keys. [Task definitions](task-definitions.md) describes both.
- **Pinned** means copied into the `task.run_opened` record when the task run opens. Code reads a
  pinned value from that record and from no other place.
- The **end writer** is `writeRunEndInTransaction`, the one function that ends a task run and writes
  its report.
- A **code-made summary** is the fixed sentence that the end writer uses as the summary when a task
  run ends with no `task.report` call.
- A **delivered report** is a report that nixie sent to the report target as a task message. A
  **kept report** is a report that exists only on the `task.run_ended` record.
  [Task runs](task-runs-and-reports.md) gives the cases.
- A **carried task run** is the task run that a raise or a restart opens to continue the work of an
  ended task run. [Task run limits](task-run-limits.md) describes it.
- A record's **payload** is its unencrypted structured data. A forget destroys only the record's
  erasable fields, so it never changes payload.

## Built

This section describes the code as it is before this design is built.

- The model reports through `task.message` with the kind `report`.
- `task.start` stores its accepted options through `taskRunOptionsSchema`, which accepts unknown
  keys.
- A tool declares its input as one JSON Schema object. `buildToolRegistry` has one definition per
  tool name, compiles the schema once and checks every call with it.
- A call whose input fails the schema gets the outcome `invalid`, and its tool never runs. The
  outcomes of a `tool_result` are a closed list.
- A tool call's input is in the erasable fields of its `tool_called` record.
- `log.read` returns your messages, the agent's replies and tool results.
- The record forget accepts the kinds `owner_message` and `model.reply`. The record forget is the
  forget of one record: it destroys the key of the record's erasable fields.
- The `task` prompt has 5 parts. Its `inputs` part and its `instructions` part are empty.
  [Prompts](../../architecture/core/prompts.md) describes the parts.

## The `task.report` tool

Usage: [a task ends its task run](sketches/tasks/01-usage.ts), section A. Types and texts:
[the tool and its refusals](sketches/tasks/02-types.ts), section D. Flow:
[a `task.report` call](sketches/tasks/03-flow.ts), section C.

Which tasks have the tool:

- Every task on the nixie runner has `task.report`. nixie adds it even when a start or a definition
  omits it.
- The base tools of a task are `tasks.list`, `task.message`, `turn.end_silently` and `task.report`.
- The conversation never has `task.report`.

The input:

- The summary is 1 to 8000 characters after a trim. The input schema rejects an empty summary, so
  that call gets the outcome `invalid`.
- The tool has one input schema for every task, and the schema never contains a report shape. The
  reason is that the tool registry has one definition per tool name.
- nixie records an empty input for every `task.report` call. The `tool_called` record of a call,
  accepted or refused, therefore contains neither the summary nor the fields.

The check of the fields:

- `checkReportFields` is the check of a call's fields against the pinned report shape. It runs first
  in every call, and it reads nothing but the call and the pinned report shape.
- When a call gives no fields, `checkReportFields` treats the fields as an empty object. A report
  shape with no required field therefore accepts a summary alone.
- When the task declares no report shape and the call gives fields, nixie refuses the call.
- When the fields do not match the report shape, nixie refuses the call.
- When the fields are longer than 16,000 characters as JSON, nixie refuses the call. The fields land
  in the context of the report target, and an untrusted task run could otherwise fill it.
- Each of those 3 refusals has the outcome `error`.
- The text of a refusal never repeats a value or a key that the model sent. A forget of a report
  does not reach the `tool_result` record of a refused call, so that record must contain none of the
  report's words.
- Whether the validator's own error text meets that rule is not checked. (open: validator text)

The write:

- After the check of the fields, one write transaction reads whether the task run has a report
  request. When the task run has one, nixie refuses the call and gives the first `reportID`. When it
  has none, the write transaction writes `task.run_report_requested`.
- When 2 calls in one turn both pass the check of the fields, only the first writes.
- In the same write transaction, nixie refuses a call from a step whose lease expired. How the write
  transaction detects that step is a known fault. (open: stale step check)
- The commit of the step ends the task run with the cause `reported`.

A refused call:

- When nixie refuses a call, nixie writes no report request and ends nothing.
- A refused call does not count toward a call cap.
- nixie checks each call on its own. A refused call changes nothing for the call after it.
- Only the turn limit and the dollar limit of the task run bound the number of tries.
- When the model never sends fields that match, the task run ends at its turn limit or its dollar
  limit, with a code-made summary. nixie stores nothing that the model wrote in a refused call.
- nixie checks that the fields match the report shape. nixie never checks that the fields are true.
- The design assumes that each model runtime passes a free-form object argument unchanged. That
  assumption is not checked. (open: object arguments)

## The report shape

Usage: [a start or a definition declares a report shape](sketches/tasks/01-usage.ts), section B.
Types and texts: [the report shape type and its faults](sketches/tasks/02-types.ts), section D.

Where a task declares it:

- `reportShape` is a member of the start input. It sits beside `report`, which carries the report
  mode.
- A `task.start` call accepts `reportShape`, and a definition file accepts it.
- `task.define` does not accept `reportShape`. A definition written from chat has no report shape.

What a report shape may contain:

- A report shape has `properties`, which maps each field name to a field schema, and an optional
  `required` list.
- A field schema uses only these keywords: `type`, `description`, `enum`, `items`, `properties`,
  `required`, `maxLength`, `maxItems`, `minimum` and `maximum`. The type `FieldSchema` is the table
  of those keywords and their values.
- A field name is 1 to 40 characters. The first is a letter, and the others are letters, digits and
  underscores.
- A `description` is at most 200 characters. An `enum` has 1 to 50 values.
- A field is optional unless the `required` list beside its `properties` contains its name.
- Every name in a `required` list is a key of the `properties` beside that list.
- The report shape is at most 4,000 characters as JSON. The limit exists because nixie copies the
  report shape into every `task.run_opened` record, into the first message of every task run and
  into every refusal.
- nixie adds `type: object` and `additionalProperties: false` to the report shape and to every
  object inside it. A report therefore never carries a field that the report shape lacks.
- nixie stores the report shape with its keys sorted, so one report shape gives one definition hash.

The check of a report shape:

- `checkReportShape` is a pure function of the tasks module. `planTaskStart` calls it, and no other
  code accepts a report shape.
- The seed checks a definition through `planTaskStart`. Which of the 2 lands first is not settled.
  (open: seed check order)
- `checkReportShape` checks the keywords, each `required` name and the size. It then compiles the
  result once.
- nixie therefore refuses, at the seed and at the start, a report shape that the validator cannot
  compile.
- When `checkReportShape` refuses, the start is refused with the reason `report_shape` and one of 4
  faults: `keyword`, `value`, `required` or `size`. At the seed, nixie puts the file's name before
  the sentence.
- 3 lists of keywords exist: the type `FieldSchema`, the description of the `task.start` tool, and
  the sentence of the `keyword` fault. Code builds the second and the third from the first.

Where nixie stores a report shape:

- The start writes it to `options.reportShape` of `task.created`.
- The seed writes it with the definition's version: [task definitions](task-definitions.md).
- The claim that opens a task run copies it from one of those 2 places into `task.run_opened`. A
  carried task run copies it from the task run that it carries on.
- The fold of `task.run_opened` writes it to the `task_runs` projection.
- `task.report`, the end writer and the render of the `report-shape` block read the pinned copy. A
  change to a definition therefore applies from the next task run that opens.
- A report shape is payload. A forget therefore never destroys the field names, the descriptions or
  the `enum` values of a report shape.

## The report body

The report body is the same text in `task.run_ended` and in the delivered task message. Types:
[the report body](sketches/tasks/02-types.ts), section E. Usage:
[the report that reaches the report target](sketches/tasks/01-usage.ts), section C.

- The declared fields are under the key `fields`. A declared field therefore never collides with
  `summary`, with `missing`, or with a key that a release after this one adds.
- When a task run with a report shape ends with no report, the body has the code-made summary and
  `missing`. `missing` is the list of the top-level declared field names. Code never writes the
  value of a field.
- When a forget destroys the key of a report request before the task run ends, the end writer finds
  no report. It writes the code-made summary and `missing`.

## How the model learns the report shape

The first message of a task run can carry 2 blocks before the brief: the `trigger` block and the
`report-shape` block. Text: [the `report-shape` block](sketches/tasks/02-types.ts), section E.

- `renderRunBlocks` in the sessions module renders both blocks. nixie stores neither block.
- The `report-shape` block carries the pinned report shape as JSON Schema. A task run with no report
  shape gets no `report-shape` block.
- `renderRunBlocks` calls the render of the `trigger` block, which
  [task runs of a definition](definition-task-runs.md) owns. The `trigger` block comes first.
- [The task brief](task-brief.md) owns the place of the 2 blocks in the first message.
- At the first turn of a carried task run, `renderRunBlocks` renders nothing. The carried task run
  resumes a session that has both blocks.
- When nixie rebuilds the session of a carried task run, `renderRunBlocks` renders both blocks. For
  the `trigger` block, it follows `carriesRunID` back to the first task run of the chain, because
  that task run has the fire.
- The trigger details are in a block and not in the `task` prompt. They change at each fire, and a
  prompt that changes at each task run would break the session of a `continuing` task.

## Who reads a report

- The report target reads the body in the envelope of a task message:
  [task messages](task-messages.md).
- `log.read` returns an entry of the role `task` for every `task_message` record on the thread that
  it reads. Types: [the `log.read` entry](sketches/tasks/02-types.ts), section E.
- `log.read` cuts each entry at 2,000 characters, so a long summary can cut the fields off.
- Code that needs one field reads the erasable `fields` of `task.run_report_requested`, which is
  typed JSON.

## The forget of a report

The words of a report are in the erasable fields of up to 3 records: `task.run_report_requested` and
`task.run_ended` on the task's thread, and the delivered task message on the thread of the report
target.

- `listReportRecords` in the tasks module returns the sequences of those records from any one of
  them. It finds them through the `reportID` in the `task_runs` projection.
- When you forget a delivered report, the record forget destroys the key of each of those records.
- The record forget then invalidates the task's session and the session of the report target.
  Whether the built session cleanup does this is not checked. (open: forget session cleanup)
- The record forget accepts the kind `task_message`.
- You cannot forget a kept report on its own. nixie destroys it when you forget its task's thread.

## Which module owns what

- The tasks module owns `task.report`, `checkReportShape`, `checkReportFields`, the end writer, and
  the records `task.run_opened`, `task.run_report_requested` and `task.run_ended`.
- The tools module owns `buildSchemaParser`, the parser that `checkReportShape` compiles a report
  shape with.
- The sessions module owns `renderRunBlocks`, and the memory module owns `log.read`.
- The definitions module runs the seed checks through functions that the tasks module exports.

## Not in scope

- Report fields or inputs that code fills from queries, and a registry of named queries. The model
  fills every field.
- A `reportShape` key on `task.define`.
- An input schema per task run for `task.report`.
- A second copy of the fields as JSON on `task.run_ended`.
- A function that reads one field of a report. No code calls one.
