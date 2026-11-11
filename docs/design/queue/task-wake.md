# Waking a task with a message

This doc covers what a message does to a task that is waiting. When the receiving task is wakeable,
nixie starts a task run for the message. When the receiving task is not wakeable, the task reads the
message at its next task run, and the sender does not wait for a reply. `tasks.list` shows which
tasks are asleep, so a sender can check before it sends.

This doc holds the rules. The sketches are the TypeScript files in `sketches/tasks/`: they hold the
type definitions and the exact texts, and each section here links the part it uses. Terms that this
doc does not define are in the [glossary](../../glossary.md) and in the Terms section of
[task runs](task-runs-and-reports.md), which defines task run, step, claim, started task, report
mode and hop limit.

## Terms

- The **conversation** is your chat with nixie. It is a task that never closes.
- A **task definition** is a task that your definitions declare, and a **definition's task** is the
  one task that runs it: [task definitions](task-definitions.md).
- A task's **stored state** is its state in the `tasks` table, such as `ready` or `waiting`.
- A task is **waiting** when its stored state is `waiting`: it has no step to run until something
  wakes it.
- An **open wait** of a task is a reply that the task waits for. A task opens a wait when it sends a
  `question` or a `request` and nixie expects the receiver to reply.
- A task is **wakeable** when a message to it can start a task run.
- A task is **asleep** when it is waiting, it is not wakeable, and it has no open wait. An asleep
  task has no open task run, because a turn that sends nothing ends the task run of a task that is
  not wakeable.
- The **listed state** of a task is the state that `tasks.list` returns for it. It is the stored
  state, or one of `idle`, `finished` and `asleep`.
- A task is **finished** when it is waiting, it is wakeable, it has no open wait, and its newest
  task run ended with the cause `reported`. In the task docs, "finished" has only this meaning.
- A **kept report** is a report that nixie did not send as a message, as under the report mode
  `none`. [Task runs](task-runs-and-reports.md) gives the cases.

## Built

This section describes the code as it is before this design is built. Where a section after it
differs, the design replaces the built behaviour.

- `TaskProfile.isWokenByMessages` decides whether a message wakes a task. `readTaskDirectory` sets
  it to true for every started task.
- The server builds its task messaging setup with 2 hard-coded entries, one for the task
  `memory-writer` and one for the task `memory-consolidator`. Each entry sets `isWokenByMessages` to
  false.
- When the receiver is a task with `isWokenByMessages` false, `planTaskMessage` marks the message
  for the task's next step and opens no wait for the sender.
- `pickListedTaskState` returns `finished` for a waiting task whose last sent message is a report,
  and `idle` for any other waiting task.
- `tasks.list` omits the row of the task that calls it.

## Which tasks are wakeable

The tasks module owns `wakeable`. Types: [the wakeable types](sketches/tasks/02-types.ts), section
K.

- `TaskProfile.wakeable` is the field that carries whether a task is wakeable. It takes the place of
  `isWokenByMessages`.
- The conversation is wakeable.
- Every started task is wakeable. The input of `task.start` has no `wakeable` key.
- A definition's task is wakeable when its definition file sets `wakeable: true`. The default is
  `false`. [Task definitions](task-definitions.md) owns the parsing of the key.
- The tasks `memory-writer` and `memory-consolidator` are not wakeable, for as long as they exist.

## A message to a waiting task

Flow: [a message to a task](sketches/tasks/03-flow.ts), section I.

A wakeable receiver:

- When a message reaches a waiting, wakeable task, nixie sets the task's stored state to `ready`.
  The next claim of a step for that task opens a task run.
- The hop limit bounds that wake. When the message is past the hop limit, nixie stores it unread and
  does not wake the task. The task reads it in its next turn.

An asleep receiver:

- When a message reaches an asleep task, nixie starts no task run. The task reads the message at its
  next task run.
- When the message is a `question` or a `request`, nixie opens no wait for the sender. The result of
  the `task.message` call carries a note that the receiver is asleep. Text:
  [the asleep note](sketches/tasks/02-types.ts), section K.

The wait of the sender:

- The caller of `planTaskMessage` passes whether the receiver is running a step.
- A `question` or a `request` opens a wait for the sender in 2 cases: the receiver is wakeable, or
  the receiver is running a step.
- In every other case, a `question` or a `request` opens no wait.
- The wake rule adds no state to the task state machine.

## What `tasks.list` returns

- Each listed task carries `wakeable`.
- An asleep task with a schedule carries `nextRunAt`, an ISO time. The time is the next fire of the
  schedule: [schedules and triggers](schedules-and-triggers.md). (open: nextRunAt source)
- In the API contract, the task list has the optional fields `wakeable` and `nextRunAt` and the
  state `asleep`.

`pickListedTaskState` picks the listed state by the first line of this table that applies:

| Stored state | Open wait | Wakeable | Newest task run                 | Listed state     |
| ------------ | --------- | -------- | ------------------------------- | ---------------- |
| not waiting  | any       | any      | any                             | the stored state |
| `waiting`    | yes       | any      | any                             | `waiting`        |
| `waiting`    | no        | no       | any                             | `asleep`         |
| `waiting`    | no        | yes      | ended with the cause `reported` | `finished`       |
| `waiting`    | no        | yes      | any other                       | `idle`           |

- For the listed state `finished`, `pickListedTaskState` reads the newest task run of the task from
  the `task_runs` projection.
- `pickListedTaskState` does not read the last message that the task sent. A kept report sends no
  message, so the last message cannot show that the task reported.
- A wakeable task that reports under the report mode `none` therefore has the listed state
  `finished`.

## Not in scope

Other docs own these:

- Whether a definition's task run resumes its session or opens one: the `fresh` and `continuing`
  values in [task definitions](task-definitions.md).
- The parsing of `wakeable`, and the next fire time of a schedule.
- The view of tasks in the web app.
