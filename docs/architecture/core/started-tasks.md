# Started tasks

A started task is a task that the conversation starts through the start tool, for work that needs
its own context, can wait or lasts beyond the turn, and that no listed task covers. The user may
have asked for the work, or the model may have seen it needed. It runs on the same state machine,
inbox and controls as every [task](./tasks.md), and this doc covers what only a started task has:
the start and its options, the sandbox runner that runs its steps, and its limits.

## The start

The conversation starts a task with a name and a brief. The start checks the step's lease as a
message write does, and writes the task's creation record in the ready state under a
[short ID](./database.md#short-ids), with the name in its erasable fields, and the brief as the
task's first [message](./task-messages.md): a `task_message` record on the task's thread, written in
the same transaction, which the creation record names by its message ID. The creation record holds
which task started it, and the tasks projection keeps that on the task's row, so the directory finds
every started task. A forget of the name leaves the task listed under its ID. The creation record
holds no copy of the brief, so a forget has one record to reach. The creation record holds the
task's [start options](#start-options) in its plain payload too.

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

| Option       | Values                       | When the start leaves it out            | The start refuses                                                                                                  |
| ------------ | ---------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `model`      | a name of a selectable model | the `task` role's profile               | a name that is not a choice, or a model whose harness lacks what a task needs                                      |
| `persona`    | `default` or `none`          | the starter's persona                   | `none` with `memory: read`, or `default` from a starter with none                                                  |
| `memory`     | `none` or `read`             | `none`                                  | a memory tool, read or write, that the value leaves out, or `read` from a starter that reads none, or `self_notes` |
| `log`        | `own` or `conversation`      | `own`                                   | `conversation` from a starter that does not hold the conversation's log                                            |
| `tools`      | names of tools               | the clock                               | a tool that the starter does not hold, under either of its names                                                   |
| `report`     | `wake`, `next_turn`, `none`  | `wake`                                  | nothing                                                                                                            |
| `disposable` | `true` or `false`            | `true`                                  | nothing                                                                                                            |
| `limits`     | turns, dollars or both       | the defaults of `models.limits.taskRun` | a value above the max of `models.limits.taskRun`                                                                   |

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

The value `self_notes` is the memory grant of a task definition, and a start never sets it. It gives
a task everything that `read` gives, and the self-note writes of the assistant: `memory.remember`,
`memory.edit`, `memory.retopic` and `memory.retire`, by default. The grant lifts only the self-note
caller check, as [self-notes](../memory/writes.md#self-notes) says, and every other memory write of
a task stays as it is without the grant. A `task.start` with `memory: self_notes` is refused with a
sentence that says to define the task, whoever starts it, so a task never starts a task with the
grant. The input schema of `task.start` lists the value, so the refusal reaches the planner and the
model reads that sentence. The task run of a started task never holds the grant, even when its
stored options name the value. A worker holds no memory tool. The definitions repo and `task.define`
accept `self_notes`, a `task.define` that sets it asks the user before it applies, and the task run
of a stored version that holds it gets the grant.

The `log` option is the log grant. With `log: conversation`, the task's `log.read` and
`log.read_image` read the conversation's thread of the [event log](../core/event-log.md), and with
`own` they read only the task's own thread. The conversation holds the grant, and a started task
holds it only when its own start gave it, so a chain of starts passes the grant on and a task
without it never gives it. A definition's task and a task that the user started by moving a message
to it hold no grant as starters, as they hold no memory and no persona. The grant follows the
runner's `logThread` of the tool run ([reading the log](../memory/context.md#reading-the-log)), and
nothing else of the conversation's log reaches a task: memory retrieval adds no past message to a
task's turn.

A start that sets the grant beside a tool that sends data outside nixie passes the decision point as
it would without the grant, because the decision point decides by the tool's declared effects and
the user's rules, so the grant widens what a task reads and never where nixie sends. A definition
file may set `log: conversation`, because the user wrote the file, and the seed checks it as a start
from a starter that holds the grant. The runner sets the thread of the grant at the start of each
step, from the started task's options or the definition version that the task run pins, and nothing
stores it, so the model never picks a thread.

A grant that the task loses in the middle of a step, because its definition or its options change,
counts until the step ends. The task's `log.read` records its call and its result on the task's own
thread, so a forget of the task's thread removes what the task read and the conversation's thread
holds only the conversation's work.

A forget of a record on the conversation's thread cleans the open task with the grant, as it cleans
an open task that reads memory, because the task's session can hold the record's text from a read.
The cleanup reads a started task's grant from its creation record, and a definition's task from the
version its newest task run pinned and the version in force, because the task's session can outlive
a task run.

Each write from a task goes through the same [write gate](../memory/writes.md) as the
conversation's. A task's `memory.remember` or text edit cites no message of the user on its own
thread, so it waits for review with the reason `no_quote`, unless an allow rule covers it. A task's
`memory.unpin` applies at once, as the conversation's does. A start may name no skill tool either,
because only the conversation's thread has a skill list, so a skill tool would refuse every call of
the task. A start may name none of the 3 tools that list or change the task definitions, which only
the conversation holds, as
[changes from the conversation](definitions.md#changes-from-the-conversation) says. The starter rule
that asks before a stranger reads memory needs a decision point that can ask, so until then the
start refuses that combination
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
[controls](./tasks.md#pause-stop-and-close) it offers, the start tool that picks it (or none), the
fixed tasks it owns, and whether the restart sweep keeps the sandboxes of its open tasks.

| Key            | Controls | Start tool           | Fixed task   | Keeps sandboxes |
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

`task.start` starts the default runner, the sandbox runner, and its input is a plain object. Every
other runner that a model can start has a start tool of its own, such as `coding.start` for the
[coding runner](./coding-tasks.md#starting-and-joining), with that runner's input. Each runner's
start plans itself. A refusal comes back as the tool's error before the policy decision, so a
refused start writes no proposal. A rule matches the sandbox start by the tool name
`task.start/sandbox`, and the other starts by their own tool names, as [rules](../policy/rules.md)
describes.

A control that the task's runner does not offer gets `runner_lacks_control`, which the API returns
as `RUNNER_LACKS_CONTROL`. A runner that starts through `task.start` stores its built options in the
creation record. Any other runner stores the shared envelope, with the report mode and limits,
beside `runnerOptions` of its own.

## The sandbox runner

The server gives the steps of every started task to the sandbox runner, the step function in
`modules/sessions` that runs a started task. The steps claim through a claim pool of their own, so
the conversation never waits behind them
([leases and the restart sweep](./leases-and-restart-sweep.md#claim-pools)). Each step runs in a
[sandbox of the task's own](../connectors/sandboxes.md#a-started-tasks-sandbox), on the profile of
the task's model, or of the `task` role when the start chose none. The sandbox's one grant is that
profile's credential, and the turn goes to that profile's base URL, so a profile that points at a
[model gateway](../policy/model-gateway.md#routes) route has its replies priced on that route. The
step runs the same turn code as the conversation's steps, with these changes:

- The system prompt is the `task` prompt. In its default parts, the frame holds the task's name, the
  rule that nobody reads the task's plain text, and a last paragraph that tells the task to call
  `task.report` when its brief is done and, unless the report mode is `none`, names where the report
  goes by that target's envelope label. The persona part holds the persona unless the start set
  `persona: none`, and the inputs and instructions parts are empty. The default frame holds no
  brief, and the prompt is the same text on every task run and in every session of a task. A
  deployment can [override any of these parts](./prompts.md#overrides-from-the-definitions).
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
thread. The newest change wins. A `task.created` record with no mark reads as kept, so an unmarked
task never closes. The conversation, the queue check, system tasks and any task that no start made
carry no mark and never close by themselves.

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
after a crash gets the same answer. The close sends the caller no report message: a task run that
ends because its report target closed it keeps its report, as [Reports](#reports) says. The owner's
close control and a disposable task's auto-close still deliver theirs.

A started task holds the tool only when its start names it in `tools`. The tool declares the `note`
effect with no destination, so the starter rule `allow-notes` allows it with no approval. The tool,
the model's records and the prompts hold no sandbox ID, image or size.

## The listed state

A started task's step that leaves no unread input moves the task to the `waiting` task state,
whether or not its work is done. The task state alone therefore can't tell a task that waits on a
reply from a task with nothing left to do. So the list tool gives a task in the `waiting` task state
one of 4 listed states, from its [message waits](./task-messages.md#message-waits), whether it is
wakeable, and how its newest task run ended:

- `waiting`: the task has an open wait on another task.
- `asleep`: the task has no open wait, and no message wakes it. A definition's task that is asleep
  and has a next fire also shows `nextRunAt`, in UTC.
- `finished`: the task is wakeable, has no open wait, and its newest task run ended `reported`.
- `idle`: the task is wakeable, has no open wait, and its newest task run ended another way or is
  open.

The list tool reads the end of the newest task run, never the last message the task sent, because a
kept report sends none. The `waiting` filter lists `asleep` tasks too. A task in any other task
state lists under that state. The list tool also gives each task's `wakeable` flag and its model, or
null for a task on the `task` role's profile.

Each listed task shows only the first line of its brief, clipped to 200 characters, and
`isBriefClipped` says when text was left out. A page of the list ends at a byte budget that keeps it
inside the tool output limit, or at the optional `limit`, and returns `nextCursor` when tasks
remain. The cursor holds the position of the last listed task in the list order, so a task that
changes between pages moves to the top and a later page can skip it. Start again with no cursor for
a fresh view. The `taskID` input returns one task with its whole brief, whatever the state, limit or
cursor.

A started task can wait with unread input, such as its brief. Only a waking inbox record moves a
waiting task to ready, so such a task never runs. At each server start, after the server writes the
conversation task and before any claim, it moves each such task to ready. A task that the user
paused or stopped keeps its state.

## Task runs

A task run is one stretch of a started task's work that ends in one report. A claim opens a task run
when the task has none open and a waking message, a raise or a restart is waiting, and the task run
ends when the task reports, reaches a limit, stops, closes or fails. The 3 records
`task.run_opened`, `task.run_report_requested` and `task.run_ended` hold it, and the `task_runs`
projection folds them into one row per task run, with the open task run in the unique
`task_runs_open` index.

A definition's task opens its task runs on a fire, as
[the task of a definition](definitions.md#the-task-of-a-definition) describes.

A task run pins what it needs when it opens: the report mode and its target, the report shape, and
its limits. A raise or a restart opens a task run that carries the one before it, as
[limits](#limits) describes. A task has at most one open task run, and a rerun of a step joins it,
so a crash after an action ran and a rerun of the step give exactly one report.

A record belongs to a task run by the `taskRunID` it carries, or, for a record with none, by its
place between the opening and the end of a task run. Only a tool call's records and a failed turn's
spend record can land after their task run ended, because a step writes them with no lease check, so
only they carry the ID. A record that lands between one task run's end and the next one's opening,
such as a message after a report, belongs to no task run until a claim opens one for it. Every count
of a task run's use reads its records through one function, so the meters and the caps agree.

Each tool call in a task run carries the ID, and a tool can have a cap of calls per task run: a call
past the cap is a `tool_result` with the outcome `denied` and no decision, and a call that was
invalid, denied, failed or errored never counts toward it. The cap needs no approval, because it
only narrows what a task run may do. A call counts when its outcome is `result`, `queued` or
`unknown`, or while it has not returned, and the tools module counts by `taskRunID` alone, so it
imports nothing from the tasks module. A carried task run takes the caps of the first task run, and
each cap counts only the carried task run's own calls. A call cap denies the call and never pauses
the task, so the rest of the work goes on.

### Opening a task run

A task run is pending, then open, then ended. The projection has a row only from the claim, so a
task has a pending task run when it has unread waking input and no open task run, and a started
task's brief is its first waking input. A claim that finds the task with no open task run checks, in
this order:

1. The limit hold: the task has reached a limit and the user has not raised it. A held task opens no
   task run, and the claim pauses it.
2. A raise of the limit or a restart by the user that is newer than the end of the task's newest
   task run, which ended with `limit`, `stopped` or `failed`. The claim opens one carried task run
   for it.
3. The unread waking input. The task run's origin is the cause that woke the step: the brief, a task
   message, a message of the user, a timer or an outside event.

A definition's task checks an unread fire before a raise or a restart, and a raise or a restart
before an unread message, as [the task of a definition](definitions.md#the-task-of-a-definition)
describes. A claim that finds an open task run that is active or waiting on a reply runs the step in
it, whether the step is a rerun or a waking message caused it. A unique partial index allows one
open task run per task, so a rerun of a first step opens no second one and a rebuild of the
projection gives the same rows.

The opening record pins the report mode, the report target, the report shape and the limits, and
every reader reads those 4 values from it, so a change to a definition applies from the next task
run. The report target is the starter for a started task and the conversation for a definition's
task run, and null only under the mode `none`.

### Ending a task run

One function, which the tasks module does not export, ends every task run and writes its report. It
runs in the transaction of the step's commit, the stop, the close or the failure that ends the task
run, and writes nothing when the task has no open task run. When a step commits, the first row that
applies decides:

| The commit finds                           | End cause   | The task's next state                        |
| ------------------------------------------ | ----------- | -------------------------------------------- |
| a report request                           | `reported`  | what the step asked                          |
| a reached limit                            | `limit`     | `paused`, under the limit hold               |
| the runner returned `done`                 | `no_report` | `done`, or `waiting` for a definition's task |
| a first step that found no work            | `no_work`   | `waiting`                                    |
| a quiet turn, and the task is not wakeable | `no_report` | `waiting`                                    |

A commit that finds more queued work, including a turn that an interrupt cut, an open wait for a
reply or an event, or a quiet turn on a wakeable task, leaves the task run open. The user's stop
ends the task run with `stopped` and the close with `closed`, each in the transaction that writes
the control, and a step error that fails the task ends it with `failed` in the error's transaction.
The restart sweep ends no task run: the rerun of a step joins the open one. When the transaction
that ends a task run throws, the task run stays open and the caller's retry ends it.

A kept started task that reported is wakeable and waits with its sandbox asleep until the user
closes it. A disposable one closes itself, as [the mark](#the-mark-and-closing) says. A kept or a
disposable task is never `done` after a report, because a `done` task refuses messages and has no
sandbox. A definition's task is never `done` either. A step whose task run holds a report request
runs no further model turn, so when the lease of a step that called `task.report` expires, the rerun
does no work and its commit sends the first summary and fields under the first report ID.

The end writer delivers the report, and the first row that applies decides:

| The case                                    | What nixie writes                               | Delivery    |
| ------------------------------------------- | ----------------------------------------------- | ----------- |
| the end cause is `no_work`                  | no message                                      | `kept`      |
| the report target is done, failed or closed | no message                                      | `kept`      |
| the mode `none`                             | no message                                      | `kept`      |
| the mode `next_turn`                        | a `task_message` of kind `report`, with no wake | `next_turn` |
| the mode `wake`, past the hop limit         | a `task_message` of kind `report`, with no wake | `next_turn` |
| the mode `wake`, inside the hop limit       | a `task_message` of kind `report`, with a wake  | `wake`      |

The message goes from the task to the report target, with the report ID as its message ID and the
body of `task.run_ended`. The hop of an end that a step commits is the hop of that step's lease. An
end that commits no step, such as a stop, a close, a failure or the claim's end of an idle task run,
takes the hop of the task's newest step, so a stop wakes the starter whenever the task run's own hop
allows it and never resets a loop's hop count. A report to a target whose listed state is `finished`
goes out under its report mode, because that target accepts messages and the hop limit bounds the
wake. A kept report exists only on `task.run_ended`, because a message on the task's own thread
would read as the task's input. A `task.message` of kind `report` that a task sends during a task
run is an ordinary message that ends nothing. nixie never treats a report as a message from the
user. A definition's task run reports under `next_turn` by default, because a scheduled task run
under `wake` would spend a conversation turn on each fire.

## Reports

A started task ends its task run with one report: a summary and, when the start declared a
`reportShape`, fields that match it. The model calls `task.report`, which checks the fields against
the pinned shape, refuses a second report in the task run with the first report's ID, and writes a
`task.run_report_requested` record that holds the words only in its erasable fields. A report shape
takes a closed table of keywords, and nixie adds the object type and closes every object, so one
shape always gives one text. nixie sends nothing from a call that fails the check, and the refusal
repeats no value that the model sent.

Every task on the sandbox runner holds `task.report`, even when its start or definition omits it,
and the conversation never holds it. Its input schema is the same for every task and holds no report
shape, because the registry keeps one definition per tool name, so nixie checks the fields against
the pinned shape in code. The `tool_called` record holds an empty input, so it holds neither the
summary nor the fields. A call that passes no `fields` counts them as an empty object, so a shape
with no required field accepts a summary alone. nixie refuses a call, with the outcome `error`, when
the task declares no shape and the call has fields, when the fields fail the shape, or when the
fields pass 16,000 characters as JSON. A refusal writes and ends nothing, counts toward no call cap,
and never repeats a value or a key that the model sent, because a forget of the report never reaches
the refused call's result. Only the turn and dollar limits bound the tries. After the check, one
write transaction refuses a step whose lease expired, refuses a second request in the task run with
the first report's ID, and writes the request. Of 2 calls in one turn, only the first writes.

A report shape is a closed subset of JSON Schema: a table of keywords that nixie can enforce, with
field names that match `^[A-Za-z][A-Za-z0-9_]{0,39}$`, and every `required` name a property of its
object. It takes at most 4,000 characters as JSON, because nixie copies it into every
`task.run_opened`, every first message and every refusal. The start and the seed check it before
they accept the task, and a shape that the validator cannot compile is refused. nixie stores the
shape with sorted keys and with the object type and `additionalProperties: false` on every object,
so one shape gives one definition hash. A shape is plain payload, so a forget never destroys a field
name or an `enum` value. A task run carries the shape in `task.run_opened`, and a carried task run
copies it from the one it continues. A definition file takes the same `reportShape` key, and
`task.define` takes none.

The first turn of a task run renders the `trigger` block of a definition's task run, then a
`report-shape` block, when the task run has a shape. The block tells the model to end with
`task.report` and passes the shape as one line of JSON. Its `fence` attribute holds the first 4 hex
digits of the task run's ID, which the model never sees, so the model cannot close the block early,
and a rerun or a rebuild renders the same block. nixie stores neither block. They sit in a block
because a prompt that changes at each fire would break the session of a task whose `context` is
`continuing`, as [what opens a task run](definitions.md#what-opens-a-task-run) describes. The first
turn of a carried task run renders neither, because the resumed session holds both. A rebuilt
session of a carried task run renders both, and takes the fire from the first task run of the chain.

The task run's end writes the report, once, in the transaction of the step's commit, the stop or the
close that ended it. When the task made no report, nixie writes a code-made summary for the cause
and lists the fields it lacks as `missing`. A forget that destroyed the request before the end
leaves the same code-made summary. The report mode decides the delivery:

- `wake`: a task message of kind `report` goes to the starter and wakes it, inside the
  [hop limit](./task-messages.md#the-hop-limit). Past the hop limit it waits for the starter's next
  turn.
- `next_turn`: the message goes to the starter with no wake.
- `none`: nixie keeps the report on the `task.run_ended` record and sends no message.

A report to a starter that is done, failed or closed, the end of a task run that did no work, and
the end that the report target caused by closing the task, are kept the same way. An end for a limit
under a mode that does not wake the starter also writes a `task.limit_notice` to the starter, so the
starter learns the task paused.

The report's words sit in up to 3 records: the request, `task.run_ended`, and the delivered message
on the report target's thread. A report that the task made reads as a summary of 1 to 8,000
characters and, with a shape, the fields. When the task made none, the summary is a sentence that
nixie wrote for the end cause, such as "The run stopped at its turns limit before it wrote a
summary", and `missing` lists each top-level field of the shape. The same body reaches both
`task.run_ended` and the message.

A task that finishes a turn with no report ends its task run as `no_report`. A forget of a delivered
report destroys the request, the end and the message together, and rebuilds the sessions of each.
The forget accepts the message of a report from any one of the 3 records, and finds the other two
through the task run's row. It runs the session cleanup once per destroyed record, so the cleanup
reaches the task's thread and the report target's thread. The user cannot forget a kept report on
its own, only by forgetting its task's thread. A forget of the request before the end leaves the
summary that nixie writes and `missing`. `log.read` shows each task message on the thread it reads
as an entry of the role `task`, with no text once the message is forgotten.

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
above the spend. One exception: a summary can hold no token counts, so it adds no dollars, and the
count of a task that has one can fall below its spend.

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
