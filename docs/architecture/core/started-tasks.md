# Started tasks

A started task is a task that the conversation starts through the start tool, for work that the user
asks for and that no listed task covers. It runs on the same state machine, inbox and controls as
every [task](./tasks.md), and this doc covers what only a started task has: the start and its
options, the nixie runner that runs its steps, its limits, and the routing records and moves that
send it the user's messages.

## The start

The conversation starts a task with a name and a brief. The start checks the step's lease as a
message write does, and writes the task's creation record in the ready state under a
[short ID](./database.md#short-ids), with the name and brief in its erasable fields. The creation
record holds which task started it, and the tasks projection keeps that on the task's row, so the
directory finds every started task. A forget of the name leaves the task listed under its ID. The
creation record holds the task's [start options](#start-options) in its plain payload too.

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

| Option    | Values                       | When the start leaves it out            | The start refuses                                                                 |
| --------- | ---------------------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| `model`   | a name of a selectable model | the `task` role's profile               | a name that is not a choice                                                       |
| `persona` | `default` or `none`          | the starter's persona                   | `none` with `memory: read`, or `default` from a starter with none                 |
| `memory`  | `none` or `read`             | `none`                                  | a memory tool that the value leaves out, or `read` from a starter that reads none |
| `tools`   | names of tools               | the clock                               | a tool that the starter does not hold                                             |
| `report`  | `wake`, `next_turn`, `none`  | `wake`                                  | nothing                                                                           |
| `limits`  | turns, dollars or both       | the defaults of `models.limits.taskRun` | a value above the max of `models.limits.taskRun`                                  |

The [selectable models](./model-profiles.md#selectable-models) give the choices of `model`, which
the tool's input schema lists with their descriptions. The conversation has the persona and reads
memory, and a started task has each only when its own start gave it, so a task it starts never has
more. The tools a task holds are its starter's tools that the start named, plus the list tool and
the message tool, and so never more than its starter holds. A start with `memory: read` also gives
the task each memory tool that only reads and that its starter holds, and a start may name no memory
tool that writes. A start with `memory: none` may name no memory tool at all. A start may name no
skill tool either, because only the conversation's thread has a skill list, so a skill tool would
refuse every call of the task. The starter rule that asks before a stranger reads memory needs a
decision point that can ask, so until then the start refuses that combination
([GEO-1803](https://linear.app/zgeoff/issue/GEO-1803/nixie-policy-the-full-decision-point-with-destination-limits-known)).

The report mode decides how the task's result reaches its starter. Under `wake` a report wakes the
starter unless the task sends it with `wake: false`, under `next_turn` the message tool sends each
report to the starter with no wake, and under `none` the message tool refuses a report to the
starter.

A task that the user starts by [moving a message](#moving-a-misrouted-message) to a new task holds
no options. It runs with no persona and no memory, on the `task` role's profile, with the list tool,
the message tool and the clock, under the default limits.

## The nixie runner

The server gives the steps of every started task to the nixie runner, the step function in
`modules/sessions` that runs a started task. The steps claim through a claim pool of their own, so
the conversation never waits behind them
([leases and recovery](./leases-and-recovery.md#runner-pools)). Each step runs in a
[sandbox of the task's own](../connectors/sandboxes.md#a-started-tasks-sandbox), on the profile of
the task's model, or of the `task` role when the start chose none. The sandbox's one grant is that
profile's credential, and the turn goes to that profile's base URL, so a profile that points at a
[counting proxy](../policy/counting-proxy.md#routes) route has its replies priced on that route. The
step runs the same turn code as the conversation's steps, with these changes:

- The system prompt is the built-in `task` prompt. Its frame holds the task's name and brief, its
  persona part holds the persona unless the start set `persona: none`, and its inputs and
  instructions parts are empty.
- A task started with `memory: read` gets the pinned memory and memory retrieval in its turn, as the
  conversation does. Any other task gets neither. No task gets the task board.
- The task's tools are the ones its start recorded. Each call goes through the
  [decision point](../policy/decision-point.md), as the conversation's tool calls do.

The brief is in the task's creation record, and no inbox record holds it. So the task's first
session opens with a start note as its input. The note tells the model to do what the brief asks,
and to send the result to the task that started it, as a task message of kind `report`, unless the
start set `report: none`. After the step that sends the report, the task waits: a message to it
wakes it again, and the user closes it when its work is done. When the guest loses the task's
session, the next step [opens a new one](./session-opening.md) from the task's thread and the
messages it sent.

A started task can wait with unread input, or with a brief that no session read. Only a waking inbox
record moves a waiting task to ready, so such a task never runs. At each server start, after the
server writes the conversation task and before any claim, it moves each such task to ready. A task
that the user paused or stopped keeps its state.

## Limits

A started task has a limit of turns and of dollars, which its start set or took from
`models.limits.taskRun`. Each model turn record on the task's thread counts as one turn, and its
token counts, priced with the task's profile, count as its dollars. Each summary of the task's
session records the token counts of its calls too, and they count as dollars and as no turn. A
profile with no price table counts no dollars, so only its turns limit holds. A record sums its
calls, and the per-call usage that the model API reports leaves out thinking tokens, so the count
prices each record as one call. It therefore prices every cache write at the longer lifetime's
price, and a turn whose calls together pass a profile's long-prompt size at the long-prompt prices.
The count can run above the spend, and never below it.

Before each step runs a turn, the runner counts the task's turns and dollars. When either count has
reached its limit, the step runs no turn. In one transaction it asks for a pause, writes a
`task.limit_reached` record on the task's thread, and writes a `task.limit_notice` record into the
inbox of the task that started it, unless that task has finished. The step then commits with its
work left, so the task pauses in the ready state. The notice wakes the starter, and its model reads
the task's ID and counts in a system message that says only the user can resume the task. The
message leaves out the task's name, because a model wrote that name, and the model trusts a system
message as nixie's own text.

While the newest limit record on the task's thread is `task.limit_reached`, a resume or a restart of
the task refuses. The user raises the limit with the `task-raise` host command
([host commands](../deployment/host-commands.md#tasks)), which writes a `task.limits_raised` record
and resumes a paused task in one transaction. A task that the user stopped after the pause stays
stopped, and a restart runs it under the raised limit. A raise names turns, dollars or both, and
refuses when no value goes above the limit the task reached or one falls below it. The max of
`models.limits.taskRun` never caps a raise, because it bounds only what a start asks for.

## Routing records

Each start from the conversation, and each conversation message to another task, writes a routing
record on the conversation's thread. The record names the task and the user's messages that the work
came from: the on-behalf-of IDs of the message, or, when the message lists none, the conversation's
unread user messages. A user message can come from another task's thread, when the user wrote it
there and later moved it to the conversation. The task's thread then gets a copy of the routing
record too, because a client reads one thread at a time. A message-routes projection keeps one row
per routed user message with the task it went to, and a later route of the same message replaces the
row. The tool's note tells the model to say in its reply where the work went, and the
[client](../channels/client.md#routing-marks) shows each route beside the user's message.

## Moving a misrouted message

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
