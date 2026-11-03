# Tasks

A task is a durable piece of work that runs one step at a time, and its whole history is records on
its own thread of the [event log](./event-log.md). A step reads the task's unread inbox, does its
work, such as one model turn, and commits its records and the task's next state in one transaction.
A crash before the commit leaves the task as it was, and the next step runs that work again. The
conversation is itself a task, with a fixed ID, that waits for the user's messages, under the
[conversation and tasks decision](../../decisions/0018-the-conversation-and-tasks.md). The tasks
module owns tasks, their inbox and their timers.

[Leases and recovery](./leases-and-recovery.md) covers how a runner claims a step and what a restart
does, and the [tasks design](../../design/platform/core/tasks.md) covers the states and waits that
are not built. The [glossary](../../glossary.md) defines a task run and a lease.

## States

```mermaid
stateDiagram-v2
  [*] --> ready: a task is created with its brief
  [*] --> waiting: the conversation is created
  ready --> running: a runner claims a step
  running --> ready: the step commits with work left, or throws
  running --> waiting: the step commits with nothing unread
  running --> done: the step commits as done
  running --> failed: 3 steps in a row throw
  failed --> ready: a restart, or a server start for the conversation
  waiting --> ready: a record lands in the inbox, or a server start revives a started task with work left
  running --> paused: the step ends after a pause
  ready --> paused: a pause
  waiting --> paused: a pause
  paused --> ready: a resume
  paused --> waiting: a resume
  running --> stopped: a stop
  ready --> stopped: a stop
  waiting --> stopped: a stop
  paused --> stopped: a stop
  stopped --> ready: a restart
  stopped --> waiting: a restart
  closed --> [*]
```

A task's row in the tasks [projection](../../glossary.md) holds its state, and every change of state
is a record on the task's thread, so a rebuild of the projection gives the live rows. Every state
but closed can move to closed, which the diagram leaves out, as
[pause, stop and close](#pause-stop-and-close) describes. A running task whose runner died stays
running until a claim or recovery takes it back ([leases and recovery](./leases-and-recovery.md)).

## The inbox

A task's inbox is the records on its thread whose kind is input for it: a message from the user, a
fired timer, an action's outcome, a message from another task, or a message the user moved. A step's
own records share the thread and stay out of the inbox.

Every inbox record wakes the task, except a task message in one of these cases, which
[task messages](./task-messages.md) explains:

- its receiver runs only on its schedule, as the memory writer does;
- its sender sent it with no wake;
- the hop limit held it back.

The tasks projection keeps the sequence of the newest waking record on the task's row, and a waiting
task becomes ready in the same transaction that writes the record. The same write ends the
conversation's retry wait, so the user's next message gets a try at once.

nixie refuses inbox input for a task that does not exist or has finished, which means done, failed
or closed, because no step would read the input. A done or closed task never runs again. A failed
task refuses input until a restart returns it to ready.

A step reports the inbox sequences it read. Its commit moves the read cursor forward over them,
oldest first, and stops at the first sequence the step did not read. A record past that gap stays
unread, so a step that skipped a record sees it and the records after it again. A `log_reset` record
on a task's thread moves the read cursor up to itself, so a message still unread at a
[reset of the conversation](./event-log.md#resetting-the-conversation) never starts a turn.

## Steps

The server supplies the step function, and the tasks module runs it. A claim takes a task's lease
and records the step's start, with a step key made of the task's ID and the number of the step. The
number counts committed steps, so the step after a crash keeps the key of the step the crash lost,
and the claim first records that lost step as interrupted. A step that runs a model turn can return
the session boundary it reached, the last entry of the Agent SDK session, and the commit stores it
on the step's record. The next step receives the boundary of the last commit, and
[conversation turns](./conversation-turns.md#resume-and-fork) covers how a turn forks the session
there.

A step commit writes the step's records, the moved read cursor, any timers the step asked for, and
the task's next state, all in one transaction that checks the step's lease first and frees it last.
The commit record carries the step key, which the log holds unique, so a second commit for the same
step fails and changes nothing. The next state is ready when the step asked to continue or input
arrived while it ran, done when the step returned done, and waiting otherwise. Input that arrived
during a step makes the task ready whatever the step chose, because that input still needs a step to
read it.

A step that throws records its error and frees the lease, and the task waits a retry delay before
its next claim. The error's message is free text, so the record keeps it in its
[erasable fields](./erasable-fields.md), where the web UI shows it on the failed step and a forget
can erase it. After 3 errors in a row, the task fails. A commit that refuses the step's result, such
as a timer with an invalid due time, counts as a step error too.

A lost lease counts as no error, and neither does a process that lost the writer lock. The runner
stops and commits nothing, because another runner or another process owns the work now.

Step errors never fail the conversation, under the
[conversation and tasks decision](../../decisions/0018-the-conversation-and-tasks.md), because every
deployment needs it to answer. Its wait before each retry doubles with each error in a row, up to a
cap. Each error record holds the count of errors in a row, the count at which any other task would
fail, and the retry time. Once the conversation's count reaches that limit, the server reports the
conversation's turns as failing in its readiness report, and the web UI says that nixie is failing
to answer. That part of the report is advisory, so a deployment never stops sending requests to
nixie for it. The next turn that commits clears both. A server start makes a conversation in the
failed state ready again with its errors cleared, because a failed task never wakes.

## Pause, stop and close

The user controls a task with 6 [checked actions](../channels/api.md) of the API: pause, resume,
stop, restart, close and interrupt. Each one writes its own record on the task's thread. The tasks
module checks each control against a transition table of the task's states, so a refused control
writes nothing and returns the state it met.

While a step runs, its runner watches the task's thread for controls, so a stop or an interrupt
reaches the step at once.

- **Pause** of a ready or waiting task pauses it at once. A pause of a running task records a pause
  request, and the step runs on: its commit, its error or the recovery of its lease then pauses the
  task in the same transaction. A paused task keeps the state it left, ready or waiting, and no
  runner claims it. A step that commits as done finishes the task, because a pause keeps only work
  that remains. A step error that uses up the task's tries fails the task, and the pause request
  ends with the step, so only a restart runs the task again.
- **Resume** of a paused task returns it to the state it left, or to ready when waking input arrived
  while it was paused. A resume of a running task withdraws its pause request.
- **Stop** ends the current task run. It frees the lease, so the running step's commit fails as a
  lost lease, and the runner aborts the step at once. A stop withdraws the task's pending timers, so
  they never fire, and releases each message wait that the task has open on another task. A stopped
  task takes inbox input and leaves it unread.
- **Restart** of a stopped task returns it to the ready or waiting state that the task saved when it
  last left one of them, the state that a pause keeps. A task paused before the stop therefore comes
  back ready or waiting, never paused. A restart of a failed task returns it to ready. Either goes
  to ready when waking input waits unread. The next step resumes the session from the last committed
  step, as a step after a crash does.
- **Close** ends a task for good, from any state but closed. It frees the lease, withdraws the
  pending timers and releases every message wait that names the task, on either side, and the inbox
  refuses later input. The conversation refuses a close, because every deployment needs it to
  answer, but it takes a stop and a restart.
- **Interrupt** of a running task records the step it interrupts, and the runner fires the step's
  interrupt signal. A conversation turn then ends at the last entry of its Agent SDK session and
  commits as usual, as [conversation turns](./conversation-turns.md#interrupts) describes. A step
  that runs no model has no turn to end, and commits when it would have.

While a task is paused or closed, nixie claims none of its [actions](./actions.md) that have not
started an attempt, so a pause keeps the queued actions with the task. A stop
[cancels](./actions.md#cancelled-actions) each queued action that has not started an attempt, so a
restart never sends it, and an action with a started attempt runs on to its outcome.

## Task messages

One task reaches another with a task message on the receiver's thread. A message wakes its receiver
except in the cases that the [inbox](#the-inbox) lists, and a question or a request can open a
message wait on the receiver. [Task messages](./task-messages.md) covers the tools, the hop limit
and the waits.

## Started tasks

The conversation starts a task through the start tool, with a name and a brief, when the user asks
for work that no listed task covers. The start checks the step's lease as a message write does, and
writes the task's creation record in the ready state under a [short ID](./database.md#short-ids),
with the name and brief in its erasable fields. The creation record holds which task started it, and
the tasks projection keeps that on the task's row, so the directory finds every started task. A
forget of the name leaves the task listed under its ID.

The creation record also holds the step key of the step that started the task. After a crash, that
step runs again under the same key, and its model can call the start again. The start then gives
back the task that the step already started under the same name, so a rerun never starts the work
twice. The name is erasable, so the start keeps no hash of it, and compares it in memory with the
names of the tasks that the step started. That compare runs before the write transaction. Inside the
transaction, the start counts the step's tasks again, and compares the names again when another
start of the same step committed in between.

### The nixie runner

The server gives the steps of every started task to the nixie runner, the step function in
`modules/sessions` that runs a started task. The steps claim through a claim pool of their own, so
the conversation never waits behind them
([leases and recovery](./leases-and-recovery.md#runner-pools)). Each step runs in a
[sandbox of the task's own](../connectors/sandboxes.md#a-started-tasks-sandbox), on the model
profile of the `task` role. It runs the same turn code as the conversation's steps, with these
changes:

- The system prompt is the built-in `task` prompt. Its frame holds the task's name and brief, and
  its persona, inputs and instructions parts are empty.
- The turn holds no pinned memory, no memory retrieval and no task board.
- The task's tools are the list tool, the message tool and the clock. Each call goes through the
  [decision point](../policy/decision-point.md), as the conversation's tool calls do.

The brief is in the task's creation record, and no inbox record holds it. So the task's first
session opens with a start note as its input. The note tells the model to do what the brief asks,
and to send the result to the task that started it, as a task message of kind `report`. After the
step that sends the report, the task waits: a message to it wakes it again, and the user closes it
when its work is done. When the guest loses the task's session, the next step
[opens a new one](./session-opening.md) from the task's thread and the messages it sent.

A started task can wait with unread input, or with a brief that no session read. Only a waking inbox
record moves a waiting task to ready, so such a task never runs. At each server start, after the
server writes the conversation task and before any claim, it moves each such task to ready. A task
that the user paused or stopped keeps its state.

### Routing records

Each start from the conversation, and each conversation message to another task, writes a routing
record on the conversation's thread. The record names the task and the user's messages that the work
came from: the on-behalf-of IDs of the message, or, when the message lists none, the conversation's
unread user messages. A user message can come from another task's thread, when the user wrote it
there and later moved it to the conversation. The task's thread then gets a copy of the routing
record too, because a client reads one thread at a time. A message-routes projection keeps one row
per routed user message with the task it went to, and a later route of the same message replaces the
row. The tool's note tells the model to say in its reply where the work went, and the
[client](../channels/client.md#routing-marks) shows each route beside the user's message.

### Moving a misrouted message

The user moves a misrouted message to another task, or to a new one, through one checked action of
the [API](../channels/api.md). One transaction checks the move, writes a correction record on the
message's thread, and writes a moved-message record into the inbox of the task that gains the
message. The task that lost it gets a moved-message record as well, unless that task has finished.
The correction record replaces the message's row in the message-routes projection. A move refuses a
record that is not the user's message on that thread, a task that does not exist or has finished,
and a move to the task that holds the message already. It refuses the memory writer and the
consolidator too, because both run on their own schedule and never read a message of the user's:
only the conversation and a started task take a moved message. A move to a new task creates it,
started by the user. Only the gaining task wakes, and
[conversation turns](./conversation-turns.md#inbox-records-as-messages) covers what each side reads.

## Timers

A step asks for timers in its result, and its commit sets them. A timer runner beside the task
runners fires each due timer in its own transaction, with a record on the task's thread that holds
both the due time and the fire time. A timer that fell due while nixie was down therefore fires
late, and its record shows by how much. The transaction checks the timer again before it fires it,
so a timer never fires twice. The fired record lands in the task's inbox and wakes the task.

Every wait, lease and timer reads one clock that the caller passes in, so a crash test sets and
advances time instead of sleeping. The log's writer carries the same clock, so every record's time
comes from it too.
