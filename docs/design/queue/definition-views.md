# The views of definitions, triggers and ended task runs

The web client shows 3 read views of work that started without you: the list of task definitions,
the trigger report and the list of ended task runs. The 3 views together answer one question: why a
task run happened, or why it did not.

The sketches in `sketches/definitions/` hold the type shapes of the 3 procedures. This doc holds the
rules. An item marked `(open: <name>)` is not settled, and [the open list](open/definitions.md)
holds it. The section "Built" describes the code as it is. Every other section describes the design.

The [glossary](../../glossary.md) defines task, task run, trigger, record and forget.

Terms from other docs:

- [Task definitions](task-definitions.md) defines task definition, definition ID and seed record. It
  covers the keys `name`, `brief`, `tools`, `target` and `enabled` of a definition.
- [The task of a definition](definition-tasks.md) defines definition's task and erasable field.
- [Task runs of a definition](definition-task-runs.md) defines fire, catch-up and skip. It covers
  the records `trigger.fired` and `trigger.skipped`.
- [Schedules](schedules-and-triggers.md) defines one-shot and spent one-shot.
- [Definitions from chat](definitions-from-chat.md) defines runtime definition and definitions repo.
  A runtime definition is one that the agent made in a chat. The doc covers the record
  `definition.changed` and the function that renders a trigger.
- [Undo and the export](definition-undo-and-export.md) defines undo.

Terms this doc adds:

- **Trigger report.** The list of catch-ups and skips: the fires that nixie delivered late and the
  fires that nixie skipped.
- **Ended task run.** A task run that has ended, with any cause.
  [Task runs and reports](task-runs-and-reports.md) owns the record of that end. This doc does not
  call an ended task run "finished" in prose, because [waking a task](task-wake.md) gives that word
  another meaning. The names `tasks.listFinished`, `readFinishedRuns`, `FinishedRun` and
  `/tasks/finished` all mean ended task runs (open: ended task runs name).
- **Sequence.** The number of a record in the event log. Each record has one, and a record that
  nixie writes after another has the greater one. The sequence of an ended task run is the sequence
  of the record of its end.

## Built

The design uses this built code:

- The API contract in the contract lib holds the procedures `tasks.list` and `tasks.read`.
- A procedure marked `signedIn` in the contract answers only a signed-in caller.
- The web client has a route that lists the tasks and a route that shows one task.
- The route of one task shows the task's records. Beside each record, a control shows the record in
  raw form.
- `records.follow` streams records of chosen kinds to the web client as nixie writes them.

## The 3 procedures

The inputs and outputs are in [the API procedures](sketches/definitions/02-types.ts), section M.
Example calls are in [the web client reads the views](sketches/definitions/01-usage.ts), section G.

- The API contract holds `tasks.listFinished`, `triggers.report` and `definitions.listTasks`. Each
  is `signedIn`.
- The API module serves `triggers.report` from a read that the triggers module exports.
- The API module serves `definitions.listTasks` from a read that the definitions module exports.
- The API module serves `tasks.listFinished` from `readFinishedRuns`, which the tasks module
  exports.
- Each read queries nixie's own database. The views therefore add no interface to an outside system.

## The list of ended task runs

- `tasks.listFinished` returns ended task runs, newest first, one page per call.
- `limit` is the size of a page. It is from 1 to 100.
- `before` is a sequence, and it is optional. The first call omits it. With `before`, the page holds
  only task runs that ended before that sequence.
- The result holds `next`. `next` is the value to pass as `before` in the call for the following
  page. `next` is null when no ended task run is left.
- `definitionID` is optional. With it, the page holds only task runs of that definition.
- [Task runs and reports](task-runs-and-reports.md) owns `readFinishedRuns` and its result type
  `FinishedRun`. Each `FinishedRun` holds its sequence.
- The result also holds the tasks of the page's task runs, one entry per task. The type of that
  entry, `listedTask`, is in no sketch and in no doc (open: undefined types).

## The trigger report

- `triggers.report` takes `since`, a date. The report holds the entries from that date on (open:
  view details).
- `definitionID` is optional. With it, the report holds only entries of that definition.
- An entry has one of 2 kinds: `late` or `skipped`.
- A `late` entry is one catch-up: a `trigger.fired` record whose `isCatchUp` is true.
- A `skipped` entry is one `trigger.skipped` record. The entry holds the reason of the skip.
- Each entry holds the definition ID, the name of the definition, the scheduled time and the
  sequence of its record.

## The list of definitions

- `definitions.listTasks` takes no input. It returns one entry per task definition: each definition
  from the definitions repo and each runtime definition.
- Each entry holds the name and the trigger of the definition.
- Each entry holds `rendered`, the trigger in plain words, and `next`, the time of the next fire.
  The API module computes both at each call, with the function that renders a trigger.
- `next` is null for a spent one-shot. This `next` is not the `next` of `tasks.listFinished`.
- Each entry holds the tools, the `target`, `enabled`, and the ID of the definition's task. The task
  ID is null for a definition with `target: conversation`.
- Each entry holds `origin`. It is `definitions` for a definition from the definitions repo, and
  `nixie` for a runtime definition.
- Each entry holds `createdBy`: the sequence and the kind of the record by which the definition came
  in force. For a runtime definition that record is `definition.changed`. For a definition from the
  repo it is the seed record. Which record it is for a runtime definition with several
  `definition.changed` records is not written (open: view details).
- nixie cannot read a runtime definition when a forget has destroyed the encryption key of its
  `definition.changed` record. The API module marks the entry of such a definition as unreadable.

## The web client

- The web client has the route `/tasks/finished` and the route `/definitions`.
- `/tasks/finished` shows the list of ended task runs and the trigger report.
- `/definitions` shows the list of definitions.
- On a runtime definition, `/definitions` shows an undo control. The control calls
  `definitions.undo`.
- Each entry of the trigger report and each definition has the control that shows a record in raw
  form. The control calls the procedure that the control of the task route calls (open: view
  details).
- The client follows 3 record kinds through `records.follow`: `trigger.fired`, `trigger.skipped` and
  `definition.changed`. The trigger report and the list of definitions therefore update without a
  poll. How the list of ended task runs updates is not written (open: view details).
- A forget destroys the encryption key of a record's erasable fields. Where a view would show such a
  field, it shows a marker for missing content.
- The client renders the `name` and the `brief` of a definition as plain text. The agent wrote the
  text of a runtime definition, and markup in it could alter the page.

## Not in scope

- An edit of a definition in the web client.
- A view of supervised agents.
- A view of the inputs of a model turn.
- `rendered` and `next` as stored members of a record.
- A test of the views against a production deployment.
