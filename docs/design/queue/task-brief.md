# The task brief

This doc covers the brief of a task: the record that carries the brief, the message that delivers
the brief to the model, and the place of the brief in each session. The brief is a task's work,
written as text by the task's starter or by a task definition. The model receives the brief as a
request with an ID, in the same envelope as every task message, so the model reads the brief the way
it reads any message.

This doc holds the rules. The sketches are the TypeScript files in `sketches/tasks/`: they hold the
type definitions and the exact texts, and each section here links the part it uses. Terms that this
doc does not define are in the [glossary](../../glossary.md), in the Terms section of
[task runs](task-runs-and-reports.md) and in the Terms section of [task messages](task-messages.md).
The first defines task run, step, claim, started task, starter, report mode, hop limit and carried
task run. The second defines task message, envelope, label and block. An item marked
`(open: <name>)` is not settled. [The open list](open/tasks.md) gives each item by that name.

## Terms

- A **task definition** is a task that your definitions declare, and a **definition's task** is the
  one task that runs it: [task definitions](task-definitions.md).
- The **brief record** is the `task_message` record that carries the brief of a started task.
- A turn's **user message** is the text that nixie sends to the model at the start of the turn. It
  has 2 parts in order: the **preamble**, which nixie's code writes, and the **inbox batch**, the
  unread inbox records that the turn renders.
- A session is **rebuilt** when nixie opens it again from the log, after a compaction, at the token
  limit or after a forget. The **opening** is the text at the start of a rebuilt session.
  [Session opening](../../architecture/core/session-opening.md) describes it.
- The **recent turns** of a rebuilt session are the last turns that nixie renders in full, after the
  opening.
- **Pinned** text is text that nixie renders in the opening of every rebuilt session.
- The **wait state** of a task message records whether its sender waits for a reply to it.

## Built

This section describes the code as it is before this design is built. Where a section after it
differs, the design replaces the built behaviour.

- `writeTaskStart` stores the brief in the erasable fields of the `task.created` record. It owns its
  write transaction, and it refuses a step whose lease expired.
- The `tool_called` record of a `task.start` call contains the brief as the erasable input of the
  call.
- A task's first session opens with a start note, because the task's inbox is empty.
- The nixie runner, the code that runs a task's model in a sandbox, gives a task pinned memory and
  retrieval only under `memory: read`.
- The first step of a started task runs at hop 0.
- The record forget accepts the kinds `owner_message` and `model.reply`.

## The brief record

The tasks module owns the brief record. Types: [the brief](sketches/tasks/02-types.ts), section I.
Flow: [a start writes the brief](sketches/tasks/03-flow.ts), section G.

The write:

- At a start, nixie writes the `task.created` record and then the brief record, in one write
  transaction. The brief record is on the thread of the started task.
- The brief record is an inbox record of the kind `task_message`. Its message kind is `request`.
- `task.created` carries `briefMessageID`, the short ID of the brief record. The erasable fields of
  `task.created` carry the task's name and not the brief.
- `writeBriefMessageInTransaction` is the only function that writes a brief record. Only a start
  calls it.
- When the step that started the task reruns, nixie finds the task by that step and the task's name.
  nixie writes neither record a second time.
- When the write of the brief record throws, the write transaction rolls back. A started task
  therefore always has a brief record.

The first read:

- The start commits with the started task `ready` and the brief record unread.
- The first step of the started task reads the brief record from its inbox. Its commit moves the
  read cursor past the brief record.
- When the process dies before that commit, the first step reruns with the same brief record and the
  same message ID.

Hops and waits:

- A brief record has hop 0, so the first step of a started task runs at hop 0. With the starter's
  hop plus 1, every chain of tasks would reach the hop limit one message sooner.
- The starter never waits for a reply to a brief record. The wait state of a brief record is `none`,
  and it never changes.
- The report of the task run is the answer to the brief. A wait on the brief record would never
  close under the report mode `none`.

## The brief of a definition's task run

The brief of a definition's task run has no record. Flow:
[the brief of a definition's task run](sketches/tasks/03-flow.ts), section H.

- `readTaskBrief` builds that brief from the open task run.
- The text is the `brief` of the definition version that the task run uses. `task.run_opened`
  carries the hash of that version.
- The message ID is the `briefID` of `task.run_opened`. Which code makes the `briefID` is not
  settled. (open: briefID maker)
- The time is the time that the task run opened.
- The text exists in one place, the store of definition versions. A forget of the brief therefore
  has no key to destroy.

## The readers of a brief

- Code that shows or uses a brief calls `readTaskBrief` or `readTaskBriefs`. No other function finds
  a brief. The task list, the retrieval query and the session opening are such callers.
- `readTaskBrief` takes a task and an optional sequence of the log. It returns the brief that was
  current for the task at that sequence, or the current brief when no sequence is given.
- A started task has one brief for its whole life. A definition's task has one brief per task run,
  so the sequence picks the task run.
- A started task's brief record belongs to no task run. The start writes it before the claim that
  opens the first task run, so `readTaskBrief` finds it by its sequence.
- `readTaskBrief` returns null for a fixed task. A fixed task, such as the conversation, is made
  neither by a start nor by a task definition.
- `readTaskBriefs` returns the briefs of many tasks, for a list. For a definition's task it returns
  the `brief` of the definition version in force.
- While a task definition is out of force and its task has an open task run, `readTaskBriefs`
  returns the `brief` of the version that the open task run uses.

## A reply to a brief

- A model can pass the message ID of a brief record as the `replyTo` of a `task.message` call. nixie
  sends that message to the starter as an ordinary task message.
- The `wake` flag of that message and the hop limit decide whether it wakes the starter, as for any
  task message. The report mode has no effect on that.
- That message opens no wait and closes no wait.
- The `briefID` of a definition's task run is not the ID of a message. When a `task.message` call
  passes it as `replyTo`, nixie refuses the call with the text for an unknown message ID.

## The user message of the first turn of a task run

The user message of the first turn of a task run has these parts, in this order:

1. The `status` block.
2. The memory blocks, only under `memory: read`: `pinned-memory`, `memory-index`,
   `retrieved-memory`, `retrieved-self-notes` and `retrieved-messages`.
3. The `trigger` block, only for a definition's task run that a trigger fire opened.
4. The `report-shape` block, only for a task run with a report shape.
5. The block for the start time of the previous task run, only for a definition's task run. Its
   place among parts 3 to 5 is not settled. (open: previous start block)
6. The brief, in the envelope of a task message with the kind `request`.

- Parts 1 to 5 are the preamble.
- The brief of a started task is the first record of the inbox batch.
- The brief of a definition's task run is the last block of the preamble, because it has no record.
  The inbox batch follows it.
- Under `memory: none`, a task gets no memory block and no memory tool, whatever its persona. `none`
  is the default.
- The label of a started task's brief is the label of the starter. The label of the brief of a
  definition's task run is the `definition` label.
- `renderRunBlocks` renders parts 3 and 4. [The report shape](task-report-shape.md) describes it.

## Where the brief renders

The model reads the brief before every other message of the task's thread, and it reads the brief at
most once in a session. nixie takes the first line of this table that applies. Flow:
[where the brief renders](sketches/tasks/03-flow.ts), section H.

| The case                                                           | Where the brief renders           |
| ------------------------------------------------------------------ | --------------------------------- |
| the first turn of a carried task run, in a session that it resumes | not rendered                      |
| a rebuilt session whose recent turns contain the brief record      | in the recent turns, in log order |
| any other rebuilt session                                          | pinned in the opening             |
| the first turn of a task run, for a brief record                   | first in the inbox batch          |
| the first turn of a task run, for a brief with no record           | last in the preamble              |

The first turn:

- A carried task run resumes the session of the ended task run that it continues. That session has
  the brief, so nixie does not render the brief a second time.
- `pickTurnInbox` cuts the inbox batch after an unread brief record. A task message that arrived
  after the brief record is rendered in the next turn.
- Whether the next turn runs with no wake is not checked. (open: batch cut wake)
- For a definition's task run, the inbox batch after the brief is one of 2 things: the
  `trigger.fired` record, which renders no text, or the task message that opened the task run.
- A task definition's `context` key is `fresh` or `continuing`:
  [task definitions](task-definitions.md). Under `fresh`, the first turn of a definition's task run
  is the first turn of a session. Under `continuing`, it is a turn of the resumed session.
- When a task message opens a definition's task run under `fresh`, the session starts with the brief
  of the definition version in force, and then that task message.
- When the first step of a definition's task run reruns, it renders the same `briefID`.

A rebuilt session:

- `pickPinnedBrief` decides between line 2 and line 3 of the table.
- A pinned brief is after the memory blocks and before the summary of the opening.
- The `trigger` block and the `report-shape` block of the open task run are pinned with the brief.
- For a definition's task, nixie pins the brief of the open task run and no brief of an ended task
  run.
- `model.session_opened` carries `briefSequence`: the sequence of the brief that the opening of that
  session pinned or found in the recent turns.

## The forget of a brief

- The record forget accepts the kind `task_message`.
- The forget of a brief record destroys 2 keys. One is the key of the brief record. The other is the
  key of the starter's `tool_called` record of the `task.start` call, which contains the same text.
- nixie finds that `tool_called` record through the `start_step` of the task in the `tasks` table.
- The forget then invalidates the session of the task and the session of the starter. Whether the
  built session cleanup does this is not checked. (open: forget session cleanup)
- A forgotten brief renders at its position, with its ID and the fixed text of a forgotten body:
  [task messages](task-messages.md).

## Not in scope

The design has none of these:

- A record kind of its own for the brief.
- A copy of the brief in `task.created` beside the brief record. A forget would then have 2 places
  to reach.
- A brief record that a trigger fire writes.
- Inputs that a task definition declares.

Other docs own these:

- The memory blocks and their order: [the memory index](memory-index.md) and
  [memory tools on tasks](memory-task-tools.md).
- The `trigger` block: [task runs of a definition](definition-task-runs.md).
- Tasks and sessions that a previous release wrote: slice 2 in [the task slices](slices/tasks.md).
