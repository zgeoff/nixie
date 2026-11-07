# Started tasks

A started task is a task that the conversation starts through the start tool, for work that the user
asks for and that no listed task covers. It runs on the same state machine, inbox and controls as
every [task](./tasks.md), and this doc covers what only a started task has: the start and its
options, the nixie runner that runs its steps, and its limits.

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
| `model`   | a name of a selectable model | the `task` role's profile               | a name that is not a choice, or a model whose harness lacks what a task needs     |
| `persona` | `default` or `none`          | the starter's persona                   | `none` with `memory: read`, or `default` from a starter with none                 |
| `memory`  | `none` or `read`             | `none`                                  | a memory tool that the value leaves out, or `read` from a starter that reads none |
| `tools`   | names of tools               | the clock                               | a tool that the starter does not hold, under either of its names                  |
| `report`  | `wake`, `next_turn`, `none`  | `wake`                                  | nothing                                                                           |
| `limits`  | turns, dollars or both       | the defaults of `models.limits.taskRun` | a value above the max of `models.limits.taskRun`                                  |

The [selectable models](./model-profiles.md#selectable-models) give the choices of `model`, which
the tool's input schema lists with their descriptions. The conversation has the persona and reads
memory, and a started task has each only when its own start gave it, so a task it starts never has
more. The tools a task holds are its starter's tools that the start named, plus the list tool and
the message tool, and so never more than its starter holds. The nixie runner adds the
[silent end](./conversation-turns.md#a-turn-that-ends-with-nothing-sent) to every task's tool run,
whatever its start named. A start with `memory: read` also gives the task each memory tool that only
reads and that its starter holds, and a start may name no memory tool that writes. A start with
`memory: none` may name no memory tool at all. A start may name no skill tool either, because only
the conversation's thread has a skill list, so a skill tool would refuse every call of the task. The
starter rule that asks before a stranger reads memory needs a decision point that can ask, so until
then the start refuses that combination
([GEO-1803](https://linear.app/zgeoff/issue/GEO-1803/nixie-policy-the-full-decision-point-with-destination-limits-known)).

Each tool has 2 names. nixie registers a tool under its nixie name, such as `memory.recall`. The
model sees the tool under its SDK name, such as `mcp__nixie__memory_recall`, which the Agent SDK
builds as `mcp__nixie__` and then the nixie name with each character outside letters, digits, `_`
and `-` replaced by `_`. The `tools` option takes either name, and the start records the nixie name.

When the start refuses a tool, the start's error message holds both names of each tool that a start
with the same options from the same starter would accept. When the start refuses a memory tool that
only reads, the message also holds the `memory: read` setting that the tool needs.

The report mode decides how the task's result reaches its starter. Under `wake` a report wakes the
starter unless the task sends it with `wake: false`, under `next_turn` the message tool sends each
report to the starter with no wake, and under `none` the message tool refuses a report to the
starter. A report under `wake` stays subject to the [hop limit](./task-messages.md#the-hop-limit),
so a report past that limit reaches the starter with no wake.

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

- The system prompt is the `task` prompt. In its default parts, the frame holds the task's name and
  brief, the persona part holds the persona unless the start set `persona: none`, and the inputs and
  instructions parts are empty. A deployment can
  [override any of these parts](./prompts.md#overrides-from-the-definitions).
- A task started with `memory: read` gets the pinned memory and memory retrieval in its turn, as the
  conversation does. Its retrieval searches for its brief on its first turn, and for the body of
  each task message it receives. Any other task gets neither.
- The task's tools are the ones its start recorded. Each call goes through the
  [decision point](../policy/decision-point.md), as the conversation's tool calls do.

The brief is in the task's creation record, and no inbox record holds it. So the task's first
session opens with a start note as its input. The note tells the model to do what the brief asks,
and to send the result to the task that started it, as a task message of kind `report`, unless the
start set `report: none`. After the step that sends the report, the task waits: a message to it
wakes it again, and the user closes it when its work is done. When the guest loses the task's
session, the next step [opens a new one](./session-opening.md) from the task's thread and the
messages it sent.

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
The count can run above the spend. One exception: a summary recorded by an earlier release kept no
token counts, so it adds no dollars, and the count of a task that has one can fall below its spend.

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
