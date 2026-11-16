# Started tasks

A started task is a task that the conversation starts through the start tool, for work that the user
asks for and that no listed task covers. It runs on the same state machine, inbox and controls as
every [task](./tasks.md), and this doc covers what only a started task has: the start and its
options, the sandbox runner that runs its steps, and its limits.

## The start

The conversation starts a task with a name and a brief. The start checks the step's lease as a
message write does, and writes the task's creation record in the ready state under a
[short ID](./database.md#short-ids), with the name in its erasable fields, and the brief as the
task's first [message](./task-messages.md): a `task_message` record on the task's thread, written in
the same transaction, which the creation record names by its message ID. The creation record holds
which task started it, and the tasks projection keeps that on the task's row, so the directory finds
every started task. A forget of the name leaves the task listed under its ID. The creation record
holds the task's [start options](#start-options) in its plain payload too.

The creation record also holds the step key of the step that started the task. After a crash, that
step runs again under the same key, and its model can call the start again. The start then gives
back the task that the step already started under the same name, so a rerun never starts the work
twice. The name is erasable, so the start keeps no hash of it, and compares it in memory with the
names of the tasks that the step started. That compare runs before the write transaction. Inside the
transaction, the start counts the step's tasks again, and compares the names again when another
start of the same step committed in between.

## Start options

The start tool takes these options beside the name and the brief. The start checks each one in code,
writes nothing when one fails, and tells the model why:

| Option       | Values                       | When the start leaves it out            | The start refuses                                                                                 |
| ------------ | ---------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `model`      | a name of a selectable model | the `task` role's profile               | a name that is not a choice, or a model whose harness lacks what a task needs                     |
| `persona`    | `default` or `none`          | the starter's persona                   | `none` with `memory: read`, or `default` from a starter with none                                 |
| `memory`     | `none` or `read`             | `none`                                  | a memory tool, read or write, that the value leaves out, or `read` from a starter that reads none |
| `tools`      | names of tools               | the clock                               | a tool that the starter does not hold, under either of its names                                  |
| `report`     | `wake`, `next_turn`, `none`  | `wake`                                  | nothing                                                                                           |
| `disposable` | `true` or `false`            | `true`                                  | nothing                                                                                           |
| `limits`     | turns, dollars or both       | the defaults of `models.limits.taskRun` | a value above the max of `models.limits.taskRun`                                                  |

The [selectable models](./model-profiles.md#selectable-models) give the choices of `model`, which
the tool's input schema lists with their descriptions. The conversation has the persona and reads
memory, and a started task has each only when its own start gave it, so a task it starts never has
more. The tools a task holds are its starter's tools that the start named, plus the list tool and
the message tool, and so never more than its starter holds. The sandbox runner adds the
[silent end](./conversation-turns.md#a-turn-that-ends-with-nothing-sent) to every task's tool run,
whatever its start named. A start with `memory: read` also gives the task each memory tool that only
reads and that its starter holds. A task gets a memory tool that writes only when all 3 hold: the
start names it in `tools`, the starter holds it, and the start sets `memory: read`. A start never
gives a write tool by default. A start with `memory: none` may name no memory tool at all.

Each write from a task goes through the same [write gate](../memory/writes.md) as the
conversation's. A task's `memory.remember` or text edit cites no message of the user on its own
thread, so it waits for review with the reason `no_quote`, unless an allow rule covers it. A task's
`memory.unpin` applies at once, as the conversation's does. A start may name no skill tool either,
because only the conversation's thread has a skill list, so a skill tool would refuse every call of
the task. The starter rule that asks before a stranger reads memory needs a decision point that can
ask, so until then the start refuses that combination
([GEO-1803](https://linear.app/zgeoff/issue/GEO-1803/nixie-policy-the-full-decision-point-with-destination-limits-known)).

Each tool has 2 names. nixie registers a tool under its nixie name, such as `memory.recall`. The
model sees the tool under its SDK name, such as `mcp__nixie__memory_recall`, which the Agent SDK
builds as `mcp__nixie__` and then the nixie name with each character outside letters, digits, `_`
and `-` replaced by `_`. The `tools` option takes either name, and the start records the nixie name.

When the start refuses a tool, the start's error message holds both names of each tool that a start
with the same options from the same starter would accept. When the start refuses a memory tool, the
message also holds the `memory: read` setting that the tool needs.

The report mode decides how the task's report reaches its starter, as [reports](#reports) describes.
The start can also declare a `reportShape`: the fields the task must pass with its report, beside
its summary. nixie checks that the fields match the shape and never that they are true.

## Task runners

A task runner is one definition in the server's list of task runners. The tasks module holds the
list in a registry on its context, and each definition gives the registry its key, the
[controls](./tasks.md#pause-stop-and-close) it offers, the variant of the start tool that picks it
(or none), the fixed tasks it owns, and whether recovery keeps the sandboxes of its open tasks.

| Key            | Controls | Start variant        | Fixed task   | Keeps sandboxes |
| -------------- | -------- | -------------------- | ------------ | --------------- |
| `conversation` | all 6    | none                 | conversation | yes             |
| `sandbox`      | all 6    | `task.start/sandbox` | none         | yes             |
| `queue-check`  | all 6    | none                 | queue check  | no              |

Every start record names its task's runner in `runner`, and the registry finds the runner of a task
in this order:

1. A fixed task belongs to the runner that owns it.
2. A task whose creation record names a `runner` belongs to that runner. A name with no definition
   resolves as unknown, and the step for that task throws.
3. A started task whose record names none belongs to the sandbox runner, the default, because
   earlier records never named one.
4. Any other task has no runner. It keeps all 6 controls, and the server's fallback step runs it.

The start tool has one variant per runner that a start can pick. The input holds a `runner` field
that picks the variant, and a start that leaves it out takes the sandbox variant. Each variant plans
its own start. A refusal comes back as the tool's error before the policy decision, so a refused
start writes no proposal. A rule matches a variant by the tool name `task.start/<key>`, and the name
`task.start` matches every variant, as [rules](../policy/rules.md) describes.

A control that the task's runner does not offer gets `runner_lacks_control`, which the API returns
as `RUNNER_LACKS_CONTROL`. A runner that starts from the sandbox variant stores its built options in
the creation record. Any other runner stores the shared envelope, with the report mode and limits,
beside `runnerOptions` of its own.

## The sandbox runner

The server gives the steps of every started task to the sandbox runner, the step function in
`modules/sessions` that runs a started task. The steps claim through a claim pool of their own, so
the conversation never waits behind them
([leases and recovery](./leases-and-recovery.md#claim-pools)). Each step runs in a
[sandbox of the task's own](../connectors/sandboxes.md#a-started-tasks-sandbox), on the profile of
the task's model, or of the `task` role when the start chose none. The sandbox's one grant is that
profile's credential, and the turn goes to that profile's base URL, so a profile that points at a
[model gateway](../policy/model-gateway.md#routes) route has its replies priced on that route. The
step runs the same turn code as the conversation's steps, with these changes:

- The system prompt is the `task` prompt. In its default parts, the frame holds the task's name and
  brief, the persona part holds the persona unless the start set `persona: none`, and the inputs and
  instructions parts are empty. A deployment can
  [override any of these parts](./prompts.md#overrides-from-the-definitions).
- A task started with `memory: read` gets the pinned memory and memory retrieval in its turn, as the
  conversation does. Its retrieval searches for the body of each task message it receives, its brief
  included. Any other task gets neither.
- The task's tools are the ones its start recorded. Each call goes through the
  [decision point](../policy/decision-point.md), as the conversation's tool calls do.

The brief is an unread inbox message, so the task's first turn takes it as its input, in the
`<task-message>` envelope, and takes no message behind it in that turn. The next step reads the
messages that wait. A task's plain text goes to nobody: it reaches its starter only through a
`task.message` call. When the model ends a turn with text and no call, the text stays in its notes.
The task ends its task run by calling `task.report`, as [reports](#reports) describes. After the
step that reports, a kept task waits: a message to it wakes it again and opens a new task run, and
the user or nixie closes it when its work is done. A disposable task closes in the commit of that
step instead, as [the mark](#the-mark-and-closing) describes.

A session opening after the first pins the brief as a message right after its status, as the
[session opening](./session-opening.md#the-brief) describes, so a rebuilt session still reads what
the task is for. A forget of the brief erases the brief and the starter's recorded `task.start`
call, which holds the same text, and rebuilds the sessions of both tasks. The forget finds those
calls when it starts, while the brief is still readable, and its start record keeps their sequences,
so a rerun after a crash erases the same calls.

## The mark and closing

A start marks its task disposable or kept, and `disposable` defaults to `true`. The mark sits on the
task's `task.created` record, and the user's change of it is a `task.mark_set` record on the task's
thread. The newest change wins. A `task.created` record with no mark, from the release before, reads
as kept, so an upgrade closes no task. The conversation, the queue check, system tasks and any task
that no start made carry no mark and never close by themselves.

A disposable task closes in the transaction of the step commit that ends its task run as `reported`,
`no_report` or `no_work`, when that commit leaves the task waiting with nothing unread and no open
message wait. The report goes to the starter before the close. A task run that ends at a limit, a
stop or a failure, and a commit that leaves the task ready, keep the task open with its sandbox. The
user or nixie closes it later.

`task.close` lets nixie close a started task that it no longer needs, by the ID that `tasks.list`
gives. It closes a started task in any state but ready, running and closed, and it refuses:

- an unknown ID, the conversation, and a task that no start made, such as a system task;
- the task of the call itself;
- a ready or running task, because it still works;
- a call from a step that no longer holds its lease.

A task that is already closed answers `wasClosed: true` and writes nothing, so a rerun of the step
after a crash gets the same answer. A started task holds the tool only when its start names it in
`tools`. The tool declares the `note` effect with no destination, so the starter rule `allow-notes`
allows it with no approval. The tool, the model's records and the prompts hold no sandbox ID, image
or size.

## The listed state

A started task's step that leaves no unread input moves the task to the `waiting` task state,
whether or not its work is done. The task state alone therefore can't tell a task that waits on a
reply from a task with nothing left to do. So the list tool gives a task in the `waiting` task state
one of 3 listed states, from its [message waits](./task-messages.md#message-waits) and the kind of
the last task message it sent:

- `waiting`: the task has an open wait on another task.
- `finished`: the task has no open wait, and the last message it sent is a `report`.
- `idle`: the task has no open wait, and it sent no message, or its last message is of another kind.

A task in any other task state lists under that state. The list tool also gives each task's model,
or null for a task on the `task` role's profile.

A started task can wait with unread input, such as its brief. Only a waking inbox record moves a
waiting task to ready, so such a task never runs. At each server start, after the server writes the
conversation task and before any claim, it moves each such task to ready. A task that the user
paused or stopped keeps its state.

## Task runs

A task run is one stretch of a started task's work that ends in one report. A claim opens a task run
when the task has none open and a waking message, a raise or a restart is waiting, and the run ends
when the task reports, reaches a limit, stops, closes or fails. The 3 records `task.run_opened`,
`task.run_report_requested` and `task.run_ended` hold it, and the `task_runs` projection folds them
into one row per task run with the open run first in the unique `task_runs_open` index.

A definition's task opens its task runs on a fire, as
[the task of a definition](definitions.md#the-task-of-a-definition) describes.

A task run pins what it needs when it opens: the report mode and its target, the report shape, and
its limits. A raise or a restart opens a task run that carries the one before it, as
[limits](#limits) describes. A task has at most one open task run, and a rerun of a step joins it,
so a crash after an action ran and a rerun of the step give exactly one report.

A record belongs to a task run by the `taskRunID` it carries, or, for a record with none, by its
place between the opening and the end of a run. Each tool call in a task run carries the ID, and a
tool can have a cap of calls per task run: a call past the cap is a `tool_result` with the outcome
`denied` and no decision, and a call that was invalid or denied never counts toward it.

## Reports

A started task ends its task run with one report: a summary and, when the start declared a
`reportShape`, fields that match it. The model calls `task.report`, which checks the fields against
the pinned shape, refuses a second report in the task run with the first report's ID, and writes a
`task.run_report_requested` record that holds the words only in its erasable fields. A report shape
takes a closed table of keywords, and nixie adds the object type and closes every object, so one
shape always gives one text. nixie sends nothing from a call that fails the check, and the refusal
repeats no value that the model sent.

The task run's end writes the report, once, in the transaction of the step's commit, the stop or the
close that ended it. When the task made no report, nixie writes a code-made summary for the cause
and lists the fields it lacks as `missing`. A forget that destroyed the request before the end
leaves the same code-made summary. The report mode decides the delivery:

- `wake`: a task message of kind `report` goes to the starter and wakes it, inside the
  [hop limit](./task-messages.md#the-hop-limit). Past the hop limit it waits for the starter's next
  turn.
- `next_turn`: the message goes to the starter with no wake.
- `none`: nixie keeps the report on the `task.run_ended` record and sends no message.

A report to a starter that is done, failed or closed, and the end of a task run that did no work,
are kept the same way. An end for a limit under a mode that does not wake the starter also writes a
`task.limit_notice` to the starter, so the starter learns the task paused.

A task that finishes a turn with no report ends its task run as `no_report`. A forget of a delivered
report destroys the request, the end and the message together, and rebuilds the sessions of each.
`log.read` shows each task message on the thread it reads as an entry of the role `task`, with no
text once the message is forgotten.

## Limits

A started task has a limit of turns and of dollars, which its start set or took from
`models.limits.taskRun`. The limits belong to the task run, and 2 meters count a task run's use:

- The turns meter counts the `model.turn_ended` records of the task run.
- The dollars meter prices those records' token counts with the task's profile, adds each summary of
  the task's session, which records the token counts of its calls too, and adds each
  `task.failed_turn_spent` record of the task run, which holds the dollars of a turn that left no
  turn record. A summary counts as dollars and as no turn.

The config schema refuses a profile with no price table for any profile a task can run on, as
[selectable models](./model-profiles.md#selectable-models) describes. A record sums its calls, and
the per-call usage that the model API reports leaves out thinking tokens, so the meter prices each
record as one call. It therefore prices every cache write at the longer lifetime's price, and a turn
whose calls together pass a profile's long-prompt size at the long-prompt prices. The count can run
above the spend. One exception: a summary recorded by an earlier release kept no token counts, so it
adds no dollars, and the count of a task that has one can fall below its spend.

Before each step runs a turn, the runner reads both meters. When either has reached its limit, the
step runs no turn and returns the limit as its end, and the step's commit ends the task run as
`limit`, which writes the report, a `task.limit_reached` record, and a pause that leaves the task in
the ready state with its work. The starter learns of it through the report or the limit notice, and
its model reads the task's ID and counts in a system message that says only the user can resume the
task. The message leaves out the task's name, because a model wrote that name, and the model trusts
a system message as nixie's own text.

A turn can pass the dollar limit on its own, so the runner prices each of the turn's model calls
with the task's profile as the guest reports it
([model calls](./conversation-turns.md#model-calls)). When the calls and the earlier count together
reach the dollar limit, the runner interrupts the turn
([interrupts](./conversation-turns.md#interrupts)). The turn record prices only the calls that
finished, so the turn's commit also carries the budget's tally as a `task.failed_turn_spent` record,
and the limit end counts both. The count can therefore run a little above the spend. The step sleeps
the task's imp, even with work left. A step whose guest fails after its calls reach the limit leaves
the task to its retry, which finds the meter at the limit and runs no turn.

A failed turn commits no turn record, so a step whose guest fails writes a `task.failed_turn_spent`
record with the task run's ID and the dollars its calls spent. A step whose guest fails before any
priced call writes none. The write checks no lease, because the calls spent the dollars whoever
holds the lease now. The spend therefore counts toward the dollar limit, and the step's retry gets
only the dollars that the failed turn left.

A completed turn's turn record goes in with its step's commit, and the commit checks the lease
first. When the commit fails, such as when it loses its lease, the step writes a
`task.failed_turn_spent` record with the turn's dollars instead, so the turn's spend still counts.
When that write fails too, the runner logs a `task.turn_spend_unrecorded` error event with the
task's ID and the dollars, and the count leaves that spend out.

A step that lost its lease can write its spend record after another claim has taken the step. On
each priced call, the turn's budget reads the spend records written on the task since the turn's
usage read, and lowers the dollars left by those that name the same task run. The turn therefore
stops at the dollar limit even when that late spend lands during the turn, and another task run's
spend never shortens it. A profile with no prices reads nothing. When the read fails, the step
fails, and its retry counts the task run's use again from the log.

The interrupt leaves the turn's work not done, so the task keeps that work for the raise, as
[interrupted work](#interrupted-work) describes.

While the newest limit record on the task's thread is `task.limit_reached`, a resume or a restart of
the task refuses. The user raises the limit with the `task-raise` host command
([host commands](../deployment/host-commands.md#tasks)), which writes a `task.limits_raised` record
and resumes a paused task in one transaction. A task that the user stopped after the pause stays
stopped, and a restart runs it under the raised limit. A raise names turns, dollars or both, and
refuses when no value goes above the limit the task reached or one falls below it. The max of
`models.limits.taskRun` never caps a raise, because it bounds only what a start asks for.

A raise or a restart opens a task run that carries the newest one. The totals of a piece of work are
the limits of its first task run, or the newest raise's. A raise gives the new task run those totals
less what the piece used since its newest restart, so a task that used 40 of 60 turns carries 20. A
restart gives the full totals, because a restart after a limit end would otherwise carry nothing and
end before its first turn.

## Interrupted work

An interrupt from the user or from the dollar limit ends a task's turn at the last entry of its
Agent SDK session, as [interrupts](./conversation-turns.md#interrupts) describes. When the interrupt
lands before the model ends the turn, the turn's outcome is `interrupted`, its work is not done, and
the task keeps that work for a later turn. When the interrupt lands after the model ended the turn,
the outcome is `finished`, and its task waits as usual.

1. The step of the cut turn commits with work left, so the task stays ready, and it writes the turn
   record with `isInterrupted: true`.
2. When the user or the limit asked for a pause, the commit pauses the task, the runner puts the
   task's imp to sleep, and no claim takes the task until the user resumes it or raises the limit.
   When nobody asked for a pause, the imp stays awake, and the task is claimed again at once.
3. The next step finds no unread message, yet it runs a turn, because the task's newest turn record
   carries `isInterrupted: true`. nixie opens that turn with a `task-continue` system message, in
   which nixie asks the model to continue the work that the interrupt stopped.

Other turns end before the model ends them too, such as a turn that reached its
[limit of model calls](./conversation-turns.md#model-calls), with the outcome `limit`. Such a turn
carries no mark, so its task waits for a message.

The turn record lives in the log, so the cut work survives a crash between the 2 steps. When the cut
turn left the session past the compaction threshold, the next step only writes the summary, and the
step after it runs the `task-continue` turn in a session that opens from that summary. When the
`task-continue` turn itself passes the context window, its step compacts the session and keeps the
work for the step after. A message that arrives after the interrupt starts the next turn as any
message does, and that turn gets no `task-continue` message.

The conversation keeps no interrupted work. The user interrupts the conversation to stop nixie
mid-reply, so after the interrupt the conversation waits for the next message.
