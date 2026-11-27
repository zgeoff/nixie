# Coding tasks

A coding task is a task whose steps work with a coding session that runs in another program, such as
a coding agent on a cloud machine. The task either starts the session or joins one that already
runs. Its steps call no model. They move text and events between the task and the session, and
nixie's conversation reads what a step forwards and decides what the session needs next. The coding
module holds the runner, its tools, the trigger source that reads the session's events, and the
release of a session when its task ends. It reaches the other program only through the coding
adapter interface, one adapter per program.

The one adapter is `atc`, which `adapters/coding-atc/` implements over the program's typed fleet
API. Read [the atc adapter](../connectors/coding-atc.md) for its calls and
[the wiring section](#the-atc-adapter-and-the-server) for how the server builds it.

A coding task runs no model and judges nothing about the session's work. An agent ends a turn while
a background shell still runs, so an idle session is no sign that the work is done. The conversation
reads the session and decides whether it is done, waits on the user or needs a steer. Each task run
spans the whole binding: the start or the join opens it, and only the session's end, a failed start,
a stop, a close or a failure ends it.

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
only sandbox tasks, so it has no atc variant. The atc harness is on offer exactly when the config
holds a `coding.atc` block, because the server then builds `coding.start` and the coding runner.
nixie runs no probe at start and keeps no list of the harnesses a start may use. The Agent SDK's
harness drops a tool whose input schema has a `oneOf` at its root, so the conversation's model would
never see a `task.start` that took both inputs. A start names a repo and an optional target; a join
names a session by its short ID. The start checks the input in code and writes nothing when a check
fails. The input must hold exactly one of a repo and a session, a repo URL must use https or ssh, a
target must be one that the settings list, and a join must name no target, agent or model.

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
  The step forwards the `ended` event as a progress message only when the wake set lists `ended`.
  Otherwise the task's report, which the step sends when it ends the task, is the only word of the
  end that reaches the report target.
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
the adapter's event trail from a cursor: the backlog a page at a time, then the adapter's live event
stream. The source drops each event of a session that no open coding task binds, and hands every
other event to the trigger core as a task input on its task's thread, with a `wake` flag that
follows the rules in [steps](#steps). The core keys each input by the event's own key, so an event
that the source reads twice lands once.

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

## Records and the sessions row

Every record of a coding task sits on the task's thread. The step writes `coding.session_bound` when
it reads the spawn's done outcome, and a join writes it in the start's transaction. Each record
below changes the session's row:

| Record                   | Written when                                          | Changes the row                                |
| ------------------------ | ----------------------------------------------------- | ---------------------------------------------- |
| `coding.session_bound`   | the session is bound                                  | creates it                                     |
| `coding.steered`         | the step reads a steer's done outcome                 | `hop`                                          |
| `coding.delivered`       | the step reads a note's done outcome                  | `hop`, the held answers                        |
| `coding.answer_held`     | an answer reaches the inbox before its note's outcome | the held answers                               |
| `coding.wake_set`        | `coding.watch` replaces the wake set                  | `wake`                                         |
| `coding.session_unbound` | the task lets go of the session                       | `unbound_at`                                   |
| `trigger.task_input`     | the coding source lands an event                      | `last_event_at`, and `state` for a state event |

The `coding_sessions` table has one row per coding task, keyed by the task ID, with an index on the
adapter and session ID that finds a session's open binding. Its `state` is the session's state as
the task last saw it. The row holds no erasable field, so a forget never reaches it. Because the
projection folds `trigger.task_input` in the transaction that appends it, a session event that lands
on the thread changes the row in the same commit.

## Policy

The coding module adds the effect name `coding_start`, which the start, the join and a stop of a
started session declare. It needs an effect of its own because a start acts on a coding session
outside nixie, which nixie does not see call by call, and `code_run` covers only code in nixie's own
sandbox.

| Starter rule                  | What it does                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `ask-coding-sessions`         | asks before every `coding.start`, a join included, even when the user asked for it |
| `allow-coding-spawns`         | allows `coding.spawn`, because the start call already met the user's rules         |
| `allow-stop-started-sessions` | allows a `coding.stop` whose origin is `started`                                   |
| `allow-coding-input`          | allows `coding.steer` and `coding.message` to the destinations `atc:*`             |

A start therefore asks the user for approval at most once, because `coding.spawn` never asks. When a
spawn's outcome is unknown, the user gets a separate question, whether the session started. That
question is no request for approval and does not count toward the one approval. `coding.read` and
`coding.sessions` declare `read`, and `coding.watch` declares `note`, so the starter rules allow
them.

## Tool limits

- `coding.steer`, `coding.message`, `coding.read` and `coding.watch` refuse a task that is not a
  coding task, has no bound session, or is done, failed or closed, with one sentence the model
  reads. A steer and a note sit on the task's thread, so a pause holds them and a stop cancels them
  before their first attempt.
- A steer types the whole text as one paste, newlines included, then presses Enter. The tools refuse
  text over 32,000 characters. A steer declares `none` reconciliation, so its unknown outcome goes
  to the user at once, because a resend types the line again. The step tells the report target when
  a steer fails or its outcome is unknown. A steer carries no label of its sender.
- The hop of a steer or a note is the hop of the turn that called the tool. The step writes it into
  the session's row when it reads the done outcome.
- `coding.read` makes one adapter read and never throws: a failed read gives a refusal sentence with
  the adapter's reason. Its default answer is the state, the pending question and the last reply cut
  to 2,000 characters, so a check costs little of the conversation's context. `prompt` adds the
  session's first prompt, cut to 2,000 characters, and `tail` adds the last 1 to 5 turns, whole
  turns while they fit in 8,000 characters, so a cut never leaves half a turn. A cut keeps the end
  of a reply and the newest turns. A session whose agent has no transcript reader answers
  `tail: { unsupported: true }`.
- The wake events are `waiting`, `idle`, `ended`, `gone`, `progress`, `blocked` and `decision`.
  `coding.watch` takes a whole set, and an empty set is valid: then the step forwards no event, and
  the conversation hears of the session only through an answer to a note and through the task's
  report when the session ends. The deployment's `coding.wake.started` and `coding.wake.joined` hold
  the defaults.
- The step forwards an event to the report target as a progress message and never summarises it. The
  message carries the event's kind, the state and the question or the note's text, and the
  conversation calls `coding.read` for more.

## Supervising in the live view

A coding task shows in the live view like any task, and `tasks.list` adds its session to the
listing. Keep these true when you change it:

- Read the session only from the sessions row and the `tasks` topic. The runner's list fields give
  `tasks.list` and `tasks.read` a `session` for each task that binds one: the session's origin, its
  state, the time of its last event (null before the first event) and whether the task let go of the
  session at a stop, a close or a failure. A task that binds no session lists none. No other stream
  carries the session.
- The web client shows the session on the dashboard and on the task's page only when the `coding`
  feature is on, as [the client doc](../channels/client.md#the-task-dashboard) describes. The state
  moves without a reload because every record that changes the row marks the `tasks` topic, and the
  client reads the list again on that topic, as [live updates](../channels/live-updates.md#topics)
  describes.
- A session in atc that nixie never started or joined has no row, so the source drops its events and
  it never shows. A task that started its session shows in the group "Coding sessions", and a
  finished task stays there with its session's last state until the user closes it. A task that
  joined a session shows in its ordinary group. `tasks.list` still gives it a `session`, but the web
  client draws no session line for it, because the user already watches that session in atc.
- A coding runner offers pause, resume, stop and close, with no restart or interrupt, so a stopped
  coding task can only be closed. When nixie started the session, the stop and close confirmations
  tell the user that the session stops. They mention no session for a task that joined one, or for a
  close after a stop has let go of the session.

## The atc adapter and the server

The server builds the coding runner, its tools, its source and its sweep only when the deployment's
config holds a `coding.atc` block. Without the block, no coding tool or runner exists, and a
deployment that predates the block loads unchanged.

In the block, set the gateway's URL, the principal nixie acts as, the targets nixie may start
sessions on, and a default target. Its `token` is always `deployment:atc_token`: the gateway's token
lives in the `atc_token` entry of the secrets file, like every other secret, and a config that holds
the block with no such entry stops the server at start. A deployment with no `coding.atc` block
needs no `atc_token` entry. The secret scan treats its value as one of nixie's own values.

The adapter keeps the state of each session it has seen in memory. The trail records a session's
activity but not always its state, so the adapter also reads the state of each bound session that
has not ended once a minute, and at once for a session it has not seen since it started. A state
read that fails still counts as a read, so a failing session never makes the adapter poll without
waiting.

A start stores the trail cursor it read in the `coding_start_cursors` table, under the action's
idempotency key, before it sends the spawn. A replay of the key reads that cursor again, also after
a server restart, so the catch-up from it skips no event that the session wrote after the first
spawn. A start whose cursor read or store fails, or whose spawn gives no answer, returns the unknown
outcome, so the queue keeps the key and a replay finds the first session. A refused spawn removes
its cursor, because the key is spent. A cursor that a start kept stays for a day, the time after
which the queue sends no replay, and the next store write drops it.

A join refuses a session whose target the config does not list, even when a saved short ID names it.
While it reads the backlog, the adapter yields a page of the trail when the page holds an event and
when the read caught up, and it yields no empty page while more pages wait. Once it holds the live
stream open, it yields a page for each event that gives a session event, and an empty page after
each quiet wait. The source's catch-up of a newly bound session therefore runs even when the fleet
is quiet. A stream that ends, or a gateway that cannot be reached, makes the read fail, and the
source backs off.

The adapter calls the gateway only through its typed fleet API, which it reaches at `/rpc` under the
configured URL, dropping a trailing `/mcp` from that URL first. It refuses a gateway whose version
it does not support, and maps each failure to a value of the adapter interface. A session's own text
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
