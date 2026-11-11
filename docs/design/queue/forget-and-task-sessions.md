# A forget of a record reaches the task's session

This doc designs one fix. In the designed system, when a record on the thread of an open started
task is forgotten, nixie cleans that task's session, whether or not the task reads memory. The
forgotten text is then out of the session, and the task's next step sends none of it to the model.
In the built code, nixie cleans only the sessions of tasks that read memory, which is a privacy
defect.

An open started task is a task that `task.start` started and that has not ended. The web client
offers a forget only on a record of the conversation, so a forget on a task's thread comes from a
client that calls the API with the task's thread.

Terms are in the [glossary](../../glossary.md). This doc adds 2:

- **The forget of a record** deletes the key of one record of the event log, so the record's text is
  unreadable everywhere. The glossary's "forget" covers a memory item, and this is the same act on a
  record.
- **A session cleanup** makes a task's model session invalid and purges the task's sandbox, so the
  task's next step rebuilds the session from the log. A rebuilt session reads a forgotten record as
  a gap.

This design shares its sketches, its open list and its slices with the moments family, because a
forgotten record is a gap in a [moment](moments.md). The sketches in `sketches/moments/` hold the
types and the flows as code, and this doc holds the rules. Each point that is not settled is marked
here as `(open: <name>)`, and [the open list](open/moments.md) holds it under that name. The build
of this design is slice 1 of [the slices](slices/moments.md), the family's list of pull requests.

"Built" describes the code as it stands. Every section after it describes the designed system.

## Built

- The `conversation.forget` checked action takes an `owner_message` record or a `model.reply` record
  on any thread (`forgettableKinds` in `writeForgetStart`). A task writes its replies on its own
  thread, and a task's thread is its task ID.
- `runRecordForgetCleanup` deletes the record's key. It then calls the session cleanup of the
  sessions module with the cause `{ recordSequence }`, which holds only the record's sequence. It
  commits `record.forgotten` last.
- The session cleanup of the sessions module is the `cleanupSessions` function of the nixie runner,
  the part of the sessions module that runs started tasks. `cleanupSessions` calls
  `runTaskSessionCleanup`, which reads every open started task and cleans the tasks that
  `pickCleanedTaskIDs` returns.
- `pickCleanedTaskIDs` returns a task only when its setup holds `memory: 'read'`. Its one argument
  is the list of open started tasks with their setups. It receives no cause, so it applies that one
  rule to a forgotten memory item, a destroyed moment and a forgotten record alike. (open: cleanup
  task set)
- `cleanTaskSession` writes `model.session_invalidated` and then `model.session_cleanup_completed`
  on the cleaned task's thread, each with the cause as its payload.
- The web client offers the forget on a record of the conversation only.

The effect: a forget of a reply on the thread of an open started task with `memory: 'none'` cleans
no session, and the reply is in that task's session at its next step. That is the defect. The rule
of `pickCleanedTaskIDs` is its suspected cause: the code shows it, and no test reproduces the
defect. (open: forget cause)

## The cleanup picks the task that holds the record

The pick is the list of tasks that one session cleanup cleans. The sessions module owns it. Usage:
[a forget on a task's thread](sketches/moments/01-usage.ts), section A. Shape:
[the cleanup cause and the pick](sketches/moments/02-types.ts), section A. Flow:
[the forget and the cleanup](sketches/moments/03-flow.ts), section A.

- When the cause is `{ recordSequence }`, the runner reads the record's thread from the log by the
  sequence.
- When the cause is `{ recordSequence }`, the runner cleans the open started task whose thread holds
  that record, whether or not the task reads memory. It also cleans each open started task that
  reads memory.
- When the cause is `{ itemID }` or `{ momentID }`, the runner cleans only the open started tasks
  that read memory.
- When the record sits on the conversation's thread, the pick holds only the tasks that read memory.
- `SessionCleanupCause` has 3 members: `{ itemID }`, `{ recordSequence }` and `{ momentID }`. The
  forget hands the cleanup the sequence alone, and the runner finds the thread itself.
- The cleanup writes `model.session_invalidated` and then `model.session_cleanup_completed` on each
  cleaned task's thread.
- The design adds no record kind, migration, config key, tool or API procedure.

## The order of a forget

- The forget deletes the record's key first. The session cleanup follows it, and `record.forgotten`
  is the last write. A session rebuilt after the cleanup therefore reads the record as a gap.
- Each step is safe to run twice. The server's start finishes a forget that a crash cut short.
- When a crash lands between `model.session_invalidated` and `model.session_cleanup_completed`, the
  first stands alone on the task's thread. The forget's rerun at the next start cleans the task
  again.

## Where the tests sit

Slice 1 lists 2 tests: one of `pickCleanedTaskIDs`, and one of the runner's `cleanupSessions`. Both
sit in the sessions module, because that module picks which sessions to clean. The forget's own
suite, in the API module, hands the cleanup only a sequence and replaces the runner with a stub. A
case there passes with the design built and without it, and proves nothing.

## Not in scope

- A task that has ended. The cleanup reads open tasks only. (open: ended task sandbox)
- Tool records. The forget refuses them. [Redaction](redaction.md) owns the record kinds that a
  forget takes.
- A forget control on a task's records in the web client.
- The forget of a brief or of a report. [Task messages](task-messages.md) and
  [the report shape](task-report-shape.md) own those.
