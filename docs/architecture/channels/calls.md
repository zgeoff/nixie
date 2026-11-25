# Voice calls

A call is a live voice conversation between the user and nixie. The `modules/calls` package owns the
call's state, its records, its price and the rule that a call ends when its budget runs out. It
never talks to a speech provider. It holds the `SpeechLayer` interface, and the server passes in an
adapter that implements it. The [voice design](../../design/platform/channels/voice.md) describes
the whole feature. This doc covers the module, its records, the call's thread and hand-offs, its
budget and its configuration. The server holds no speech adapter, so a server with a `voice` config
section answers `calls.start` with `SPEECH_UNAVAILABLE`.

## The speech layer

`SpeechLayer` is the whole of what the module asks of a provider:

- `open` takes the browser's SDP offer and the voice settings, and returns the SDP answer and a
  provider session ID. A provider that refuses its credential returns a refusal in place of a
  session.
- `events` takes a session ID and returns the session's stream of `SpeechEvent`s. `open` returns no
  events.
- `answer` and `say` tell the provider what to speak, and `close` ends the session. The module sends
  each answer with `final: true`.

The package's `test-utils` holds a fake layer in memory. It records each `open`, `answer`, `say` and
`close`, an `open` that the layer refused too, and a test emits each `SpeechEvent` into a session by
hand. A test build of the server wires the same fake and lets the test harness start a call and emit
events.

## The call's states

A call is `ringing`, `connecting`, `live` or `ended`. An ended call carries who ended it: `you`,
`nixie`, `budget`, `missed`, `declined` or `dropped`.

| Step            | What happens                                                                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calls.start`   | A full-scope session starts a call. One write transaction checks the refusals, creates the call, asks the server to create the call task, and writes `call.started` and `call.answered`. The call is `connecting`, and the starting session carries it. |
| `calls.connect` | The carrying session sends its SDP offer. The module opens a speech session, and the transaction that makes the call `live` charges its first minute.                                                                                                   |
| `calls.hangUp`  | Ends the call with `endedBy: 'you'`. A second hang up of an ended call returns the same result.                                                                                                                                                         |

`calls.start` refuses with one of these errors, checked in this order:

| Error                 | When                                                                       |
| --------------------- | -------------------------------------------------------------------------- |
| `VOICE_OFF`           | The config holds no `voice` section.                                       |
| `SPEECH_UNAVAILABLE`  | The config holds `voice`, and the server wired no speech adapter.          |
| `VOICE_PRICE_MISSING` | `voice/voice.yaml` sets no `price_per_minute`. The message names the file. |
| `CALL_RUNNING`        | Another call has not ended.                                                |
| `CALL_BUDGET_REACHED` | `call-day` or `call-month` has no room for a minute.                       |

`calls.connect` refuses a call that does not exist or has ended, a session that does not carry the
call, and a call that is connected or that another connect is opening. A connect claims the call
before it opens a speech session, so one call never holds two sessions. The API checks that the
calling session is live after the instructions are read and before the session opens and again in
the transaction that makes the call `live`, and a session revoked in between is refused as
`UNAUTHORIZED` with its speech session closed. A speech session that no connect keeps, because the
call ended or the charge failed, is closed. When the provider refuses its credential, the call ends
as `dropped`.

Every end of a call, hang-up included, first charges each started minute that is still unpaid, so a
hang-up between sweeps costs the minute the call had started. A call whose budget has no room for
one of those minutes ends as `budget`, with the budget line, in place of the way it was ending. The
charge reads the call inside its own transaction, so a call that ended since a sweep looked is never
charged. A budget line that fails to speak never keeps the speech session open.

A sweep closes the gaps that a crash or a silent provider leaves. On a short interval it ends a call
that stayed `connecting` past its limit, ends a `live` call whose speech session is gone, and
charges each further started minute of a live call.

## Records

Each call writes these record kinds. The model sees only the kinds with a short ID or a rendering
below, and only `call.rang`, `call.spoke` and `call.handed_off` hold text that the user can ask
nixie to forget.

| Kind               | Thread       | What it records                                                                                                                                      |
| ------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `call.started`     | conversation | A call began, who began it and the ID of its task.                                                                                                   |
| `call.answered`    | conversation | The starting session answered the call.                                                                                                              |
| `call.ended`       | conversation | The call ended, with who ended it and how many minutes it charged.                                                                                   |
| `call.spoke`       | call         | One line that the speech layer said, with its line ID: its own small talk, the holding line or the `couldnt_finish` line. It holds no other speaker. |
| `call.handed_off`  | call         | A request that the speech layer passed to nixie's turn, with its short ID.                                                                           |
| `call.heard_cut`   | call         | The user talked over a reply, and how many characters of it they heard.                                                                              |
| `call.closing`     | call         | The call ended, and its thread now runs a last turn that writes the summary.                                                                         |
| `call.rang`        | none yet     | nixie rang the user. The kind has a codec, and no code writes it yet.                                                                                |
| `call.reconnected` | none yet     | The speech session came back. The kind has a codec, and no code writes it yet.                                                                       |
| `call.turn_timed`  | none yet     | How long a turn took. The kind has a codec, and no code writes it yet.                                                                               |

The `calls` projection folds `call.started`, `call.rang`, `call.answered`, `call.ended` and
`budget.charged` into one row per call, in the same transaction as each record. A call that nixie
started is `ringing` until `call.answered` makes it `connecting`, and a call that you started is
`connecting` at once. A call is `live` once its first `call_minute` charge exists, and its minute
count is the number of those charges, so no record marks the connection. The kinds `call.started`,
`call.answered` and `call.ended` change the `tasks` live topic, because a call is a task in the task
list.

## The call thread

A call is a task of the `call` runner, which no start tool picks. `calls.start` creates the task in
its own transaction, with the call's short ID and the conversation's newest sequence at that moment,
called `seedThrough`. The runner runs the same turn code as a started task, with these differences:

- The task claims from a pool of its own, so a call's turn never waits behind a conversation turn.
  One loop claims by default, and `tasks.callClaimLoops` sets another count.
- The task takes no pause and no meter. The call budgets limit what a call spends.
- The task holds one sandbox, as any task that keeps sandboxes does.
- The turn runs on the profile that `models.roles.call` names. When the role is unset, it runs on
  the conversation's profile. The turn-input log can capture the `call` role.
- The session's prompt is the conversation's prompt followed by the voice-call prompt.
- A new session opens with two threads: the conversation's summary and recent turns through
  `seedThrough`, then the call's own thread. The call's thread shows the user's speech, the speech
  layer's small talk and the replies.
- The call gets the conversation's tool list with `call.hang_up`, so its connectors answer a request
  such as "what is on today". It never gets `call.ring`, `task.start`, `worker.run` or
  `task.report`.

## Hand-offs

After a call connects, the module reads the speech session's events and writes each one to the
call's thread:

| Event      | What the module writes                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `heard`    | An `owner_message` whose one span has the source `dictated`. It never wakes the call, because only a hand-off starts a turn. |
| `spoke`    | Nothing yet. The module holds the line until the next hand-off.                                                              |
| `hand_off` | The held `call.spoke` lines, then `call.handed_off`, in one transaction. The hand-off wakes the call's task.                 |
| `cut`      | See below.                                                                                                                   |

A `call.spoke` record wakes nothing and shows no message of its own: the turn reads each line of
small talk beside the hand-off that follows it, so the first reply of the turn is the answer. The
call's task runs one turn over what it has not read. When the turn ends, the module sends the text
of its replies to the speech layer in one `answer` call for each hand-off the turn took: the ones it
started with and the ones that landed during it, oldest first. A hand-off that already has its
answer gets no second one. A turn that fails, passes a limit or writes no text sends the
`couldnt_finish` line instead, so the speech layer never makes up an answer, and the module writes
that line as a `call.spoke` record. A turn that throws answers every hand-off that landed on the
call's thread since it started, as one that fails does. A turn that the user cut sends nothing, and
a hand-off that landed during it stays unread for the next turn to answer.

When no answer has been sent `hold_after_ms` after a hand-off, the module sends the `holding` line
through `say`. That line is not part of the answer. The module writes it as a `call.spoke` record
once the speech layer has it. A second hand-off during a running turn joins that turn as a mid-turn
message, and the turn answers it with the same text as the first.

A `cut` event does one of two things:

- Before the module sent an answer, it interrupts the call's turn.
- After the module sent an answer, it writes `call.heard_cut` with the reply's record and the count
  of characters heard. The next turn reads the reply split where the user stopped hearing it, both
  in a session that continues and in one that rebuilds.

When the call ends, `call.closing` lands on the call's thread. The task's last turn reads it, writes
the summary as its reply, and the step reports that reply to the conversation as a `report` message.
A last turn that fails reports with no summary and names the call's task.

## The conversation's wakes

`call.started`, `call.answered` and `call.ended` are inbox kinds of the conversation. Each wakes it,
and a call that the user starts writes the first two in one transaction, so one turn reads both. The
conversation reads each as a `call` system message, and it may end the turn silently. It briefs the
call with `task.message`.

## Price and budget

Each started minute of a live call charges the budgets `call-day` and `call-month` in one
transaction, with the purpose `call_minute`. The price per minute comes from `price_per_minute` in
`voice/voice.yaml`, in dollars. A deployment sets it from its provider's price. nixie has no default
for it, so a call refuses until it is set.

`call-day` and `call-month` are [built-in budgets](../policy/budgets.md#paid-tools) of $5 a day and
$50 a month. A budget file in the definitions with the same ID replaces either. When a minute does
not fit, the call says the `budget` line, ends with `endedBy: 'budget'` and keeps the minutes it
charged before.

## Configuration

Both places that hold settings are optional.

- The `voice` section of the deployment config names the `provider`, which is `gpt-live`, and the
  `credential`, a reference to a deployment secret. Without the section, calls are off.
- The `voice/` folder of the [definitions](../core/definitions.md) holds `voice.yaml`, with `voice`,
  `hold_after_ms` and `price_per_minute`, and `lines.yaml`, with the fixed lines `holding`,
  `reconnect`, `couldnt_finish` and `budget`. Every key is optional, and a missing key takes the
  default in the module.

A voice file that fails to parse never stops the server or the seed. The seed leaves the file
unapplied and logs `definitions.voice_file_skipped` with the file and its fault. Calls then use the
defaults, which hold no price, until the file is fixed. A file that is not UTF-8 text is reported
the same way, whatever the format, and a `price_per_minute` above 1000 dollars counts as a fault,
because its micros no longer add up exactly.
