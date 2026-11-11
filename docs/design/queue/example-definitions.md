# The 3 example task definitions

The guides hold 3 example task definitions: one takes notes, one tidies memory, and one reflects on
kept moments. Each example uses a `schedule` trigger and tools that any task can hold, and tests
seed it and run it. nixie has no code that serves only an example.
[Decision 0050](../../decisions/0050-no-built-in-memory-tasks.md) records the choice behind that:
memory work is done by ordinary tasks, and nixie has no built-in memory task.

[The example files](sketches/definitions/examples.md) hold the `task.yaml` of each example. This doc
holds the rules. An item marked `(open: <name>)` is not settled, and
[the open list](open/definitions.md) holds it. The section "Built" describes the code as it is.
Every other section describes the design.

The [glossary](../../glossary.md) defines conversation, task run, memory item, moment, reflection,
proposal and retire.

Terms from other docs:

- [Task definitions](task-definitions.md) defines task definition and seed, and owns the keys of
  `task.yaml`.
- [Task runs of a definition](definition-task-runs.md) defines fire.
- [Schedules](schedules-and-triggers.md) owns the keys of a schedule.
- [The log grant](task-log-grant.md) owns the `log` key. With `log: conversation`, the `log.read`
  tool of a task reads the conversation's thread.
- [Memory tools on a task](memory-task-tools.md) owns which memory tools a task can hold.
- [The memory write gate](memory-write-gate.md) owns what nixie does with each memory write of a
  task: it applies the write as a version of the item, or it files the write as a proposal.
- [The report shape](task-report-shape.md) owns `task.report`, the tool by which a task run ends
  with a report.

## Built

The examples use this built code:

- `log.read` returns the records of a thread from a given time on. Without the log grant, the thread
  is the thread of the calling task.
- `memory.recall` reads memory items. `memory.remember` saves one. `memory.edit` rewrites one.
  `memory.retire` retires one.
- A memory write holds an origin: `conversation`, `task` or `memory_writer`.
- `moment.find` lists moments by date, and `moment.read` returns the records of one moment.
- `moment.edit` writes a reflection on a moment. It can also set the moment's title.
- nixie labels a reflection with the model ID of the task run that wrote it.
- `moment.edit` moves the start or the end of a moment only when its caller is on the thread of the
  moment.
- nixie has 2 built-in memory tasks, the note-taker and the consolidator.
  [The delete of the built-in memory tasks](memory-task-delete.md) covers them and their end.

## What every example shares

- Each example is a folder under `docs/guides/examples/` with 2 files: `task.yaml` and
  `instructions.md`.
- Each `task.yaml` uses only keys that [task definitions](task-definitions.md) lists.
- Each `task.yaml` holds `name` and `brief`, which every definition must hold. Their values in the
  example files are a first draft (open: example name and brief).
- Each `task.yaml` sets `context: fresh` and `memory: read`.
- Each `task.yaml` omits `target`, so a fire opens a task run.
- Each `task.yaml` holds no `role` key, because nixie refuses that key. The task runs use the model
  profile of the model role `task`.
- The schedule values in the files are examples (open: example schedule values).
- The text of each `instructions.md` is not written (open: example instructions text). This doc
  lists what each one must tell the model.
- The definitions scaffold holds no copy of an example.
- Each memory write of an example goes through the write gate as any task's write does. Its origin
  is `task`.
- Each test that runs an example makes the schedule due through `harness.advance`. An example call
  is in [a suite makes a schedule due](sketches/definitions/01-usage.ts), section H.
- The tests run on a nixie process that the test starts, with a scripted model: a stand-in that
  returns the tool calls that the test lists.

## Note-taking

The files are in [the note-taking files](sketches/definitions/examples.md), section A.

- The folder is `docs/guides/examples/note-taking/`.
- The guide `docs/guides/taking-notes-with-a-task.md` links both files.
- The definition sets `log: conversation`.
- The tools are `log.read`, `memory.remember` and `memory.edit`.

The instructions tell the model 2 things:

1. Read your messages on the conversation's thread since the start of the previous task run.
2. Save each memory with a quote of your message and the event ID of that message.

One task run:

1. The schedule fires, and nixie opens a task run with a fresh context.
2. The model calls `log.read`. The tool returns the conversation's messages with their event IDs.
3. The model calls `memory.remember` or `memory.edit` once per memory, with the quote and the event
   ID.

Rules:

- [Task runs and reports](task-runs-and-reports.md) owns how a task run learns the start time of the
  previous task run (open: previous start block).
- The example does not track which messages a task run has read. Two task runs can therefore read
  the same message, and a message can go unread by every task run.
- The example has none of the built-in note-taker's own mechanisms: its cursor, its batches, its
  catch-up, its nudge and its flag.
- Each save is one memory write of its own.
- Whether the write gate applies a save that quotes a message of the conversation's thread, or files
  it as a proposal, is not settled (open: gate quote thread).

The tests:

- **The seed check.** A unit test of the definitions module parses the 2 files of the folder and
  checks them as a seed does. nixie accepts them.
- **The task run.** The test writes one invented message of yours on the conversation's thread and
  seeds the 2 files as `tasks/note-taking/`. It advances the clock until the schedule fires. The
  scripted model calls `log.read`, and then `memory.remember` with a quote from the message and its
  event ID. The log then holds one memory write with the origin `task` that quotes the message. The
  log holds no `memory.batch_planned` record. Whether that write is an applied version or a proposal
  depends on an open item (open: gate quote thread).

## Memory consolidation

The files are in [the consolidation files](sketches/definitions/examples.md), section B.

- The folder is `docs/guides/examples/memory-consolidation/`.
- The guide `docs/guides/consolidating-memory-with-a-task.md` links both files.
- The schedule is `every: week` with `on` and `at`.
- The tools are `memory.recall`, `memory.edit` and `memory.retire`.
- The definition omits `log`, so its task has no log grant.

The instructions tell the model 2 things:

1. Read the memory items with `memory.recall`.
2. Merge, rewrite or retire items with `memory.edit` and `memory.retire`.

One task run:

1. The schedule fires, and nixie opens a task run with a fresh context.
2. The model calls `memory.recall`.
3. The model calls `memory.edit` or `memory.retire` once per change.

Rules:

- Each rewrite and each retirement is one memory write of its own. The write gate decides for each
  whether it is an applied version or a proposal.
- The example has none of the built-in consolidator's own mechanisms: its single diff, its hold
  while a diff waits, and its sealed summary.
- The example adds no tool, no query, no record kind and no report field.

The tests:

- **The seed check.** A unit test of the definitions module parses the 2 files of the folder and
  checks them as a seed does. nixie accepts them.
- **The task run.** The test seeds the 2 files as `tasks/memory-consolidation/` and advances the
  clock until the schedule fires. The scripted model edits 2 invented memory items. The log then
  holds 2 memory writes with the origin `task`. The log holds no `memory.consolidation_proposed`
  record.

## Moment reflection

The files are in [the moment reflection files](sketches/definitions/examples.md), section C.

- The folder is `docs/guides/examples/moment-reflection/`, beside the folders of the other 2
  examples.
- The example has no guide page (open: moment guide page).
- The definition sets `log: conversation`.
- The tools are `moment.find`, `moment.read`, `moment.edit` and `log.read`.
- The tools do not include `moment.keep`, `moment.link` or `moment.retire`.
- `maxCalls` caps `moment.edit` at 3 calls in a task run. [Task run limits](task-run-limits.md) owns
  which calls count.

The instructions tell the model 4 things:

1. Find the kept moments that have no reflection, with `moment.find`.
2. Reflect on at most 3 moments in a task run, and take first the moments that were kept longest
   ago.
3. Read the records of each moment with `moment.read`, and the conversation around the moment with
   `log.read`.
4. Write one reflection on each moment, and alter no other part of a moment.

One task run:

1. The schedule fires, and nixie opens a task run with a fresh context.
2. The model calls `moment.find`.
3. The model calls `moment.read` and `log.read` for each moment.
4. The model calls `moment.edit` with a reflection, at most 3 times.
5. The model ends the task run with `task.report`. The report is the model's own summary, and the
   definition sets no report shape.

Rules:

- `maxCalls` counts calls and not moments. Code therefore does not enforce "at most 3 moments". Only
  the instructions do.
- `moment.edit` can also set a title. Code therefore does not enforce "alter no other part of a
  moment". Only the instructions do.
- The label of a reflection is the model ID of the task run. When the task uses the same model as
  the conversation, its reflections have the same label as the conversation's reflections.
- The task is not on the thread of the moment, so `moment.edit` does not move the start or the end
  of the moment for it.
- The example adds no tool, no query and no record kind. It writes a reflection through the built
  `moment.edit`.

The test:

- **The task run.** The test writes one invented moment without a reflection and seeds the 2 files
  as `tasks/moment-reflection/`. It advances the clock until the schedule fires. The scripted model
  calls `moment.read`, and then `moment.edit` with a reflection. The moment then holds one
  reflection with the model ID of the task run as its label. The moment's title is the title that
  the test wrote.

## Not in scope

- A trigger that fires on each record of the log. Every example fires on a schedule.
- A template for an example in the definitions scaffold.
- Persona text for an example.
- A change to the write gate.
- A tool that writes only a reflection. The moment example holds the whole of `moment.edit`.
- A stored query for the moments without a reflection, such as `moment.without_reflection`.
- Report fields that code fills, such as `momentsReflectedOn` and
  `stillWaiting.momentsWithoutReflection`.
- A cap on moments that code enforces.
- The `moment.keep` tool on the moment example.
- A move of the consolidator's stored time of its last pass to the consolidation example.
