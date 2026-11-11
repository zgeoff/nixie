# The delivery of a report

This doc covers what happens to the report of a task run when the task run ends: whether nixie sends
the report to the report target as a task message, whether that message wakes the report target, and
what the report contains when the model wrote none. Every task run ends in one report, so the task
that started the work always learns how the work ended.

This doc holds the rules. The sketches are the TypeScript files in `sketches/tasks/`: they hold the
type definitions and the exact texts, and each section here links the part it uses. Terms that this
doc does not define are in the [glossary](../../glossary.md) and in the Terms section of
[task runs](task-runs-and-reports.md), which defines task run, started task, starter, report target,
report mode, hop limit, limit hold, limit notice and end writer. An item marked `(open: <name>)` is
not settled. [The open list](open/tasks.md) gives each item by that name.

## Built

This section describes the code as it is before this design is built. Where a section after it
differs, the design replaces the built behaviour.

- The model sends a report as a `task_message` of kind `report`, through `task.message`.
  `planTaskReport` applies the task's report mode to that message.
- `task.start` defaults `report` to `wake`.
- A task at its limit pauses under the limit hold, and `writeTaskLimitPause` writes the limit
  notice.

## The report mode

The report is the erasable `body` of the `task.run_ended` record. Types: section E of
[the types sketch](sketches/tasks/02-types.ts).

- `pickReportMode` is the only code that holds the default report mode. The default is `wake` for a
  start and `next_turn` for a task definition.
- The default for a task definition is `next_turn` because a scheduled task run with `wake` would
  spend a conversation turn on each fire.
- The start, the seed of a task definition and the claim call `pickReportMode`. The server passes
  both defaults in `RunSettings`.

## The delivery

In the transaction that ends a task run, the end writer delivers the report by the first row of this
table that applies:

| The case                              | What nixie writes                                | `delivery`  |
| ------------------------------------- | ------------------------------------------------ | ----------- |
| the end cause is `no_work`            | no message                                       | `kept`      |
| the report target is closed or `done` | no message                                       | `kept`      |
| the mode `none`                       | no message                                       | `kept`      |
| the mode `next_turn`                  | a `task_message` of kind `report`, `wake: false` | `next_turn` |
| the mode `wake`, past the hop limit   | a `task_message` of kind `report`, `wake: false` | `next_turn` |
| the mode `wake`, inside the hop limit | a `task_message` of kind `report`, with a wake   | `wake`      |

- Whether row 2 also covers a report target with the listed state `finished` is not settled. (open:
  finished target)
- A kept report exists only on `task.run_ended`. nixie writes no message for it on the task's own
  thread, because the task would read a `task_message` there as its own input.
- The delivered `task_message` goes from the task to the report target. Its message ID is the
  `reportID`, and its body is the body of `task.run_ended`.
- A `task.message` of kind `report` that a model sends during a task run is an ordinary message.
  nixie applies the report mode to its wake, and the message does not end the task run.
- Every task run is untrusted. nixie never treats a report as a message from you.

## A report that code writes

- A task run that ends with no `task.report` call has a report that code writes. Its summary is one
  fixed sentence per end cause. Texts: [the code-made summaries](sketches/tasks/02-types.ts),
  section C.
- Which code makes the `reportID` of such a report is not settled. (open: code-made report ID)
- In the summary of a `limit` end, the limit is the text that the meter's `render` returns. (open:
  limit summary)

## The report of a `limit` end

- A `limit` end writes the limit hold.
- When the report of a `limit` end wakes the report target, nixie writes no limit notice. The report
  target therefore wakes once.
- When the report of a `limit` end wakes no task, nixie writes the limit notice as well, and the
  limit notice wakes the starter. The task is paused until you raise the limit, so the starter must
  learn of the pause.

## Not in scope

- The fields of a report and the `task.report` call: [the report shape](task-report-shape.md).
- The envelope in which the report target reads a report: [task messages](task-messages.md).
