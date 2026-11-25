# Coding tasks

A coding task is a task whose steps work with a coding session that runs in another program, such as
a coding agent on a cloud machine. The task either starts the session or joins one that already
runs. Its steps move text and events between the task and the session, and call no model, so nixie's
conversation reads what a step forwards and decides what the session needs next. The coding module
holds the runner, its tools, the trigger source that reads the session's events, and the release of
a session when its task ends. It reaches the other program only through the coding adapter
interface, one adapter per program.

No adapter package exists yet, so the server builds no coding runner, tool or source.
[The atc runner](https://linear.app/zgeoff/issue/GEO-1843) adds the first adapter and wires the
module into the server. The
[coding session runner design](../../design/queue/coding-session-runner/README.md) covers that
adapter.

[Tasks](./tasks.md) covers the state machine, the inbox and the controls that a coding task shares
with every task. [Actions](./actions.md) covers the queue that carries each call that changes the
session, and [triggers](./triggers.md) covers the core that lands each session event on a task's
thread.

## The bound session

A coding task works with one session, its bound session, from the moment the task records the
session's ID. A `coding.session_bound` record on the task's thread binds it, with the session's
origin: `started` when the task's own start created the session, `joined` when the session ran
before the task. A `coding.session_unbound` record lets go of it. The coding sessions projection
keeps one row per coding task from these records, with the session's last state, the wake set, the
hop of the last steer and the trail cursor that the session's events start from. Every other part of
the module reads the binding from that row.

The model never sees the adapter's session ID. The first time a tool lists a session, a
`coding.session_named` record gives it a short ID, and the model names the session by that short ID
in every later call. The [short IDs](./database.md#short-ids) section gives the reason. Each tool
result holds the short ID alone.

## Starting and joining

The conversation starts a coding task with `task.start`, its `runner` set to the adapter's ID. A
start names a repo and an optional target; a join names a session by its short ID. The start checks
the input in code and writes nothing when a check fails: exactly one of a repo and a session, a repo
URL over https or ssh, a target that the settings list, and no target, agent or model on a join.

Each start and each join is the call variant `task.start/<adapter ID>`, with the effect
`coding_start`. The starter rule `ask-coding-sessions` asks before every one, even one that the
user's own message asked for, because a session runs code under the user's accounts.

- **A start** writes the task and queues one `coding.start` action, which the adapter calls a spawn.
  The action carries the brief as the session's first prompt, and its action ID as the idempotency
  key, so a spawn that runs again after a crash gets the adapter's first answer. When the spawn's
  outcome lands as done, the next step binds the session.
- **A join** asks the adapter to join the session, then binds it in the start's own transaction. A
  join sends the session nothing, because the session belongs to the user until a steer or a note
  reaches it. The transaction refuses a session that another open coding task binds, so two tasks
  never steer one session. The start also refuses a session that has ended or that the adapter
  cannot reach.

## Steps

A step reads the task's inbox, takes each action outcome first, then each message and event in the
order it arrived. A step that ends the session commits as done, with the session's last reply as the
task's report, or a fallback sentence when the adapter cannot read that reply.

**Messages.** A message to the task, from another task or from the user, goes to the session as a
note through a `coding.message` action. A note never steers: the session's agent reads it beside its
conversation, and can answer it. The answer comes back as an event that names the note, and the step
replies to the sender: a reply to the task's message, or a progress message to the report target for
the user's message. An answer can reach the task before the note's outcome does. The step then holds
the answer in a `coding.answer_held` record, and replies once the note's outcome lands as done. A
reply counts its hop from the message it answers, so an exchange through a session meets the
[hop limit](./task-messages.md#the-hop-limit) as any other exchange does.

**Events.** The wake set names the session states and note labels that wake the task. The settings
give each origin its default, and a start or `coding.watch` can replace it. The defaults wake a task
that joined a session only on `waiting`, `ended` and `gone`, because the user already watches that
session. An event in the wake set wakes the task, and the step forwards it to the report target as a
progress message. An event outside the set lands on the task's thread and wakes nothing. An `ended`
state always wakes the task, so the task ends with its session, and forwards a progress message only
when the wake set lists `ended`.

## Tools

| Tool              | What it does                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `coding.sessions` | Lists the sessions that the adapter can reach and that have not ended, with the task that binds each one               |
| `coding.read`     | Returns a bound session's state, its open question and its last reply, and its prompt and recent turns only when asked |
| `coding.steer`    | Types text into a bound session's input, which the agent takes as a user turn                                          |
| `coding.message`  | Sends a bound session a note                                                                                           |
| `coding.watch`    | Replaces a coding task's wake set                                                                                      |

`coding.steer` and `coding.message` queue an action on the coding task's thread and wait a short
time for its outcome. The call itself only queues, so it declares the effect `note`. Each attempt of
the action meets the decision point under the effect `send` to the destination
`<adapter ID>:<session ID>`, which the starter rule `allow-coding-input` allows. The adapter refuses
a steer while the session waits on a menu, because typed text would pick a menu item; the action
then fails, and the next step tells the report target.

## The coding source

Each adapter has one [trigger source](./triggers.md), with the ID `coding:<adapter ID>`, which reads
the adapter's event trail from a cursor. The source drops each event of a session that no open
coding task binds, and hands every other event to the trigger core as a task input on its task's
thread, with a `wake` flag from the wake set. The core keys each input by the event's own key, so an
event that the source reads twice lands once.

At its first start the source keeps only the cursor of its first read, so it never replays the whole
trail. A session bound after the cursor passed its earlier events is caught up from the cursor that
its binding stores. A failed read backs off, doubling its wait up to a cap, and the source reports
itself unhealthy after several failures in a row.

## Releasing a session

The runner's end hook releases a task's session after the task's stop, close or failure commits:

- **A stop** lets go of the session and queues a `coding.stop` action, with the session and its
  origin, caused by the newest record on the task's thread. The starter rule
  `allow-stop-started-sessions` allows the stop of a started session. The stop of a joined session
  asks, because the user may still want that session.
- **A close or a failure** lets go of a joined session and calls the adapter for nothing, so the
  session runs on as the user's. It stops a started session through the adapter at once, then lets
  go of it. When that stop fails, the binding stays, and the server logs `coding.stop_failed`.

A spawn can finish after its task stopped, a stop can fail, and a crash can come between a control
and its release, so a sweep runs when the server starts and on an interval after. It binds each
session that a done spawn of a stopped, closed or failed task created, then releases every session
that such a task still binds.
