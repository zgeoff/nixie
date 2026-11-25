# Coding tasks

A coding task is a task whose steps work with a coding session that runs in another program, such as
a coding agent on a cloud machine. The task either starts the session or joins one that already
runs. Its steps call no model. They move text and events between the task and the session, and
nixie's conversation reads what a step forwards and decides what the session needs next. The coding
module holds the runner, its tools, the trigger source that reads the session's events, and the
release of a session when its task ends. It reaches the other program only through the coding
adapter interface, one adapter per program.

The one adapter is `atc`, which `adapters/coding-atc/` implements over the program's MCP gateway.
[The wiring section](#the-atc-adapter-and-the-server) covers it. The
[coding session runner design](../../design/queue/coding-session-runner/README.md) covers the
choices behind it.

Read this doc before you change the coding module or write an adapter for it. Read
[tasks](./tasks.md) for the state machine, the inbox and the controls that a coding task shares with
every task, [actions](./actions.md) for the queue that carries each call that changes the session,
and [triggers](./triggers.md) for the core that lands each session event on a task's thread.

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
result holds the session's short ID and never the adapter's ID.

## Starting and joining

The conversation starts a coding task with `coding.start`, a tool of its own. `task.start` starts
only sandbox tasks. The Agent SDK's harness drops a tool whose input schema has a `oneOf` at its
root, so the conversation's model would never see a `task.start` that took both inputs. A start
names a repo and an optional target; a join names a session by its short ID. The start checks the
input in code and writes nothing when a check fails. The input must hold exactly one of a repo and a
session, a repo URL must use https or ssh, a target must be one that the settings list, and a join
must name no target, agent or model.

Each start and each join is a call of `coding.start`, with the effect `coding_start`. The starter
rule `ask-coding-sessions` asks before every one, even one that the user's own message asked for,
because a session runs code under the user's accounts.

- **A start** writes the task and queues one `coding.spawn` action, which the adapter calls a spawn.
  The action carries the brief as the session's first prompt, and each attempt sends the action's
  [idempotency key](./actions.md#attempts), so a spawn that runs again after a crash gets the
  adapter's first answer. When the spawn's outcome lands as done, the next step binds the session.
  The step's commit checks the binding again in its transaction. When a join bound the session after
  the step read it, the step binds nothing and ends with a report that the other task joined first.
- **A join** asks the adapter to join the session, then binds it in the start's own transaction. A
  join sends the session nothing, because the session belongs to the user until a steer or a note
  reaches it. The transaction refuses a session that another open coding task binds, so two tasks
  never steer one session. The start also refuses a session that has ended or that the adapter
  cannot reach.

## Steps

A step reads the task's inbox, takes each action outcome first, then each message and event in the
order it arrived. A step that ends the session commits as done. The task's report is the session's
last reply, marked as outside content, or a fallback sentence when the adapter cannot read that
reply.

A message to the task, from another task or from the user, goes to the session as a note through a
`coding.message` action. A note never steers: the session's agent reads it beside its conversation,
and can answer it. The answer comes back as an event that names the note, and the step replies to
the sender. A message from another task gets a reply to that message, and a message from the user
gets a progress message to the report target. An answer can reach the task before the note's outcome
does. The step then holds the answer in a `coding.answer_held` record, and replies once the note's
outcome lands as done. A reply counts its hop from the message it answers, so an exchange through a
session meets the [hop limit](./task-messages.md#the-hop-limit) as any other exchange does.

The wake set is the list of session states and note labels that wake the task. Each origin takes its
default wake set from the settings, and a start or `coding.watch` can replace it. The defaults wake
a task that joined a session only on `waiting`, `ended` and `gone`, because the user already watches
that session. An event in the wake set wakes the task, and the step forwards it to the report target
as a progress message. Any other event lands on the task's thread and wakes nothing, with 2
exceptions:

- An `ended` state wakes the task whatever the wake set holds, so the task ends with its session.
  The step forwards it only when the wake set lists `ended`.
- An answer to a note wakes the task, so the step can reply to the note's sender.

## Tools

| Tool              | What it does                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `coding.sessions` | Lists the sessions that the adapter can reach and that have not ended, with the task that binds each one               |
| `coding.read`     | Returns a bound session's state, its open question and its last reply, and its prompt and recent turns only when asked |
| `coding.steer`    | Types text into a bound session's input, which the agent takes as a user turn                                          |
| `coding.message`  | Sends a bound session a note                                                                                           |
| `coding.watch`    | Replaces a coding task's wake set                                                                                      |

`coding.steer` and `coding.message` queue an action on the coding task's thread and wait a short
time for its outcome. The call itself only queues, so it declares the effect `note`. The decision
point decides each attempt of the action under the effect `send` to the destination
`<adapter ID>:<session ID>`, which the starter rule `allow-coding-input` allows. The adapter refuses
a steer while the session waits on a menu, because typed text would pick a menu item. The action
then fails, and the next step tells the report target.

## The coding source

Each adapter has one [trigger source](./triggers.md), with the ID `coding:<adapter ID>`, which reads
the adapter's event trail from a cursor. The source drops each event of a session that no open
coding task binds, and hands every other event to the trigger core as a task input on its task's
thread, with a `wake` flag that follows the rules in [steps](#steps). The core keys each input by
the event's own key, so an event that the source reads twice lands once.

At its first start the source keeps only the cursor of its first read, so it never replays the whole
trail. When a task binds a session after the cursor passed that session's earlier events, the source
catches up from the cursor that the binding stores. After a failed read, the source backs off,
doubling its wait up to a cap, and it reports itself unhealthy after several failures in a row.

## Releasing a session

The runner's end hook releases a task's session after the task's stop, close or failure commits:

- **A joined session** is let go of at once at a stop, a close or a failure, with no action and no
  adapter call. nixie never stops a session it joined, so the session runs on as the user's.
- **A stop** lets go of a started session and queues a `coding.stop` action with the session and its
  origin. The action names the newest record on the task's thread as its cause. The starter rule
  `allow-stop-started-sessions` allows that action.
- **A close or a failure** stops a started session through the adapter at once, then lets go of it.
  When that stop fails, the binding stays, and the server logs `coding.stop_failed`.

A spawn can finish after its task stopped, a stop can fail, and a crash can come between a control
and its release, so a sweep runs when the server starts and on an interval after. It binds each
session that a done spawn of a stopped, closed or failed task created, then releases every session
that such a task still binds. The sweep binds a spawn's session only when no step of the task read
the spawn's outcome. A step that read the outcome already settled the session, for example by
leaving it to a task that joined it first.

A done spawn's outcome that no step read lacks the session's ID when a forget erased its result, or
when the user answered that an unknown spawn happened. The sweep then cannot stop the session. It
writes one `coding.session_lost` record on the task's thread, with no free text, and in the same
commit sends the task's report target one waking `progress` message from the task. In that message,
nixie says that the session may still run, and that the user can find it in the adapter's own list
of sessions, or join it by calling `coding.start` with its session ID. A later sweep finds the
`coding.session_lost` record and does nothing more. When the report target refuses the message, as a
finished report target does, the record still stands, and the sweep logs
`coding.lost_session_unreported` once.

## The atc adapter and the server

The server builds the coding runner, its tools, its source and its sweep only when the deployment's
config holds a `coding.atc` block. Without the block, no coding tool or runner exists, and a
deployment that predates the block loads unchanged.

The block names the gateway's URL, the principal nixie acts as, the targets nixie may start sessions
on, and a default target. Its `token` is always `deployment:atc_token`: the gateway's token lives in
the `atc_token` entry of the secrets file, like every other secret, and a config that names it with
no such entry stops the server at start. The secrets file's `atc_token` entry is optional, and the
secret scan treats its value as one of nixie's own values.

The adapter keeps the state of each session it has seen in memory. The source's `events` call
carries a read of the bound sessions, and the adapter reads the state of each bound session that has
not ended every minute, and at once for a session it has not seen since it started. A state read
that fails still counts as a read, so a failing session never makes the adapter poll without
waiting.

A start stores the trail cursor it read in the `coding_start_cursors` table, under the action's
idempotency key, before it sends the spawn. A replay of the key reads that cursor again, also after
a server restart, so the catch-up from it skips no event that the session wrote after the first
spawn. A start whose cursor read or store fails, or whose spawn gives no answer, returns the unknown
outcome, so the queue keeps the key and a replay finds the first session. A refused spawn removes
its cursor, because the key is spent. A cursor that a start kept stays for a day, the time after
which the queue sends no replay, and the next store write drops it.

A join refuses a session whose target the config does not list, even when a saved short ID names it.
The adapter yields a page of the trail only when the page holds an event or the read caught up, so
the source's catch-up never stops at a page of events that the adapter drops while more pages wait.

The adapter calls the gateway only through its documented tools, refuses a gateway whose version it
does not support, and maps each failure to a value of the adapter interface. A session's own text
reaches nixie only as untrusted data.

The server wires the module in four places:

- The task runner registry holds the coding runner, so `coding.start` can start it and the task
  steps run.
- The tool registry declares `coding.spawn` and `coding.stop`, which the runner queues and no model
  calls. The conversation holds `coding.start` and the other coding tools.
- The conversation's trigger sources include the coding source, and a sweep runs beside it.
- The coding context reads the tasks context, whose registry holds the coding runner. The server
  therefore binds the tasks context to the coding context after it builds the registry.

A test build can set `NIXIE_TEST_ATC_URL`, which points the adapter at a gateway double in place of
the configured URL, because the config accepts only an https URL. The
[crash tests](./crash-tests.md) doc lists the other test-build switches.
