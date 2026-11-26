# Voice calls

A call is a live voice conversation between the user and nixie. The `modules/calls` package owns the
call's state, its records, its price and the rule that a call ends when its budget runs out. It
never talks to a speech provider. It holds the `SpeechLayer` interface, and the server passes in an
adapter that implements it. For the whole feature, see the
[voice design](../../design/platform/channels/voice.md). The server wires the
[GPT-Live adapter](#the-gpt-live-adapter) when the config's `voice` section sets the `gpt-live`
provider and the secrets file holds its credential. A config with no `voice` section turns calls
off, and `calls.start` answers `VOICE_OFF`. A `voice` section whose credential the secrets file
lacks wires no adapter, and `calls.start` answers `SPEECH_UNAVAILABLE`. A test build wires the fake
that the next section describes in place of the adapter.

## The speech layer

`SpeechLayer` is the whole of what the module asks of a provider:

- `open` takes the browser's SDP offer and the voice settings, and returns the SDP answer and a
  provider session ID. A provider that refuses its credential returns a refusal in place of a
  session.
- `events` takes a session ID and returns the session's stream of `SpeechEvent`s. `open` returns no
  events.
- `answer` and `say` tell the provider what to speak. `close` ends the session once the speech layer
  has finished the line it is speaking, or once a time limit passes, so a hang-up never cuts off the
  last line. The module sends each answer with `final: true`.
- `model` names the provider's model that speaks the call. Each `call.spoke` record carries it.

The package's `test-utils` holds a fake layer in memory. It records each `open`, `answer`, `say` and
`close`, including an `open` that it refused. A test emits each `SpeechEvent` into a session by
hand. A test build of the server wires the same fake and lets the test harness start a call and emit
events.

## The GPT-Live adapter

`adapters/speech-gpt-live` implements `SpeechLayer` on OpenAI's GPT-Live. The server creates each
session from the device's WebRTC offer and joins it on a sideband WebSocket, so the device carries
the audio and the key never leaves the host. The adapter reaches OpenAI only through the
[credential store](../connectors/credentials.md), through one fetcher: it creates the session, and
its [socket opener](../connectors/credentials.md#the-socket-opener) opens the sideband. `model` is
`gpt-live-1`, and each `call.spoke` record carries it.

The adapter creates each session with these settings:

- client delegation, so each request reaches nixie as a delegation event;
- the provider's longest acknowledgement delay, with an empty thinking part sent on each delegation,
  which keeps the speech layer silent while nixie's turn runs, so it never claims a result or
  promises one;
- `store: false`;
- a data channel that lets the device neither send an event nor receive one, so the device reads no
  instructions and sends no command.

The adapter turns the provider's events into `SpeechEvent`s:

| Provider                                            | Event                                                                                                                                                             |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| input transcript slices, then a short quiet gap     | `heard`, with the slices' text and their span on the session's timeline                                                                                           |
| a delegation                                        | `heard` for the slices up to its offset, then `hand_off`. The delegation holds no request text, so the request is that speech.                                    |
| output transcript slices, then a short quiet gap    | `spoke` with the speech layer's own small talk, never a line that the module sent through `say` or `answer`                                                       |
| the first input slice while an answer plays         | `cut`, counted after a short wait for the last words' transcript, in characters of the sent answer. The provider reports no cut.                                  |
| a timer, a warning time before the session's expiry | `session_ending`. The provider sends no warning, and the expiry comes from `session.started`, or the provider's standard limit after the open when it gives none. |
| `session.closed`, or a sideband that ends           | `dropped`, unless a `close` asked for it. The module ends the call as `dropped`, which closes its session and stops its charges.                                  |

The cut counts what the user heard by aligning the words that the speech layer said before the
user's speech to the words of the sent answer, and takes the sent text up to the last aligned word.
The speech layer paraphrases, so the count is an estimate, and the device keeps playing for a moment
after the cut.

Other rules of the adapter:

- `answer` sends the whole answer as one commentary on the delegation. The provider takes at most
  500 tokens in a commentary. The adapter counts a text's UTF-8 bytes, which are never fewer than
  its tokens, so a text past 400 bytes goes as several commentaries of 400 bytes at most, split at
  the end of a sentence. Every word of the text goes out in order. `final` marks the end inside
  nixie, because the provider has no close for a delegation.
- `say` sends a commentary with no delegation, which the speech layer words as its own. It splits a
  long line the same way.
- `close` waits for the line that the speech layer is speaking, for a bounded time, and then closes
  the session. A close that nixie asked for raises no `dropped`.
- A provider error is logged as `calls.speech_provider_error` with the session ID, and the session
  stays open. A create request that the provider answers with 401 or 403 is
  `VOICE_CREDENTIAL_REFUSED`, and any other failure, including a sideband that does not open in
  time, is `SPEECH_UNAVAILABLE`.
- Every `open` creates a session from a fresh offer of the device. The adapter holds no state across
  sessions.

The adapter's tests run against a fake GPT-Live as a loopback HTTPS and WebSocket site. The model
API test in `evals/gpt-live/` opens real sessions. In one, it says one line and one short answer,
and checks that `session.started` gives the expiry as a number. In the other, it sends an answer of
about 2,400 characters, which goes as 7 commentaries, and checks that GPT-Live speaks each sentence
in order. CI holds no model credential, so a person runs it by hand with `NIXIE_SDK_CONTRACT=1` and
`OPENAI_API_KEY` set.

## The call's states

A call is `ringing`, `connecting`, `live` or `ended`. An ended call carries who ended it: `you`,
`nixie`, `budget`, `missed`, `declined` or `dropped`.

| Step            | What happens                                                                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calls.start`   | A full-scope session starts a call. One write transaction checks the refusals, creates the call, asks the server to create the call task, and writes `call.started` and `call.answered`. The call is `connecting`, and the starting session carries it. |
| `calls.connect` | The carrying session sends its SDP offer. The module opens a speech session, and the transaction that makes the call `live` charges its first minute.                                                                                                   |
| `calls.hangUp`  | Ends the call with `endedBy: 'you'`. A second hang up of an ended call returns the same result.                                                                                                                                                         |
| `call.hang_up`  | The call's turn asks to end the call. Once the turn's answers have gone to the speech layer, the call ends with `endedBy: 'nixie'`.                                                                                                                     |

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
charges each further started minute of a live call. It also writes the report of a call whose task
stopped before its last turn, as [the call's last turn](#hand-offs) describes.

## Records

Each call writes these record kinds. The model sees `call.started`, `call.answered` and `call.ended`
on the conversation's thread, and `call.handed_off`, `call.heard_cut` and `call.closing` on the
call's thread. It reads each `call.spoke` line beside the hand-off that follows it. Of these kinds,
only `call.rang`, `call.spoke` and `call.handed_off` hold text that the user can ask nixie to
forget. The user's dictated speech is an `owner_message`, whose text sits in its
[erasable fields](../core/erasable-fields.md) as every message's text does.

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
started is `ringing` until `call.answered` makes it `connecting`, and a call that the user started
is `connecting` at once. A call is `live` once its first `call_minute` charge exists, and its minute
count is the number of those charges, so no record marks the connection. The kinds `call.started`,
`call.answered` and `call.ended` change the `tasks` live topic, because a call is a task in the task
list.

## The call thread

A call is a task of the `call` runner, which no start tool picks. `calls.start` creates the task in
the transaction that creates the call, with the call's short ID and the conversation's newest
sequence at that moment, called `seedThrough`. The runner runs the same turn code as a started task,
with these differences:

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
  `task.report`. The server registers `call.hang_up` with every other tool, and only a call's list
  names it.
- The session never compacts. A turn that passes the context window fails, and its hand-offs get the
  `couldnt_finish` line.

## Hand-offs

After a call connects, the module reads the speech session's events and writes each one to the
call's thread:

| Event      | What the module writes                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `heard`    | An `owner_message` whose one span has the source `dictated`. It never wakes the call, because only a hand-off starts a turn while the call is live. |
| `spoke`    | Nothing yet. The module holds the line until the next hand-off.                                                                                     |
| `hand_off` | The held `call.spoke` lines, then `call.handed_off`, in one transaction. The hand-off wakes the call's task.                                        |
| `cut`      | See below.                                                                                                                                          |

A `call.spoke` record wakes nothing and shows no message of its own: the turn reads each line of
small talk beside the hand-off that follows it. The call's task runs one turn over what it has not
read. When the turn ends, the module joins the text of all the turn's replies and sends it to the
speech layer in one `answer` call for each hand-off the turn took: the ones it started with and the
ones that landed during it, oldest first. A hand-off that already has its answer gets no second one.
A turn that fails, passes a limit, ends with a proposal still waiting for the user, or writes no
text sends the `couldnt_finish` line instead. The line claims no outcome, so the speech layer never
makes one up, and the module writes it as a `call.spoke` record. A proposal counts when the turn's
task asked for it or it sits on the call's thread, after the turn began. A turn that throws answers
every hand-off that landed on the call's thread since it started, as one that fails does. A turn
that the user cut sends nothing. Each hand-off it started with closes, with no answer and no holding
line, and a hand-off that landed during it stays unread for the next turn to answer. A cut turn also
drops a hang-up it asked for.

When no answer has been sent `hold_after_ms` after a hand-off, the module sends the `holding` line
through `say`. That line is not part of the answer. The module writes it as a `call.spoke` record
once the speech layer has it. A second hand-off during a running turn joins that turn as a mid-turn
message, and the turn answers it with the same text as the first.

What a `cut` event does depends on when it arrives:

- Before the module sent an answer, it interrupts the call's turn and stops the hand-off's holding
  line. The GPT-Live adapter raises a `cut` only while an answer plays, so on GPT-Live this case
  never arises, and talking over the holding line leaves the turn running.
- After the module sent a reply, it writes `call.heard_cut` with the reply's record and the count of
  characters heard. The next turn reads the reply split where the user stopped hearing it, both in a
  session that continues and in one that rebuilds.

A cut on a hand-off that got the `couldnt_finish` line, or that a cut turn closed, does nothing: the
speech layer spoke none of a reply, and the turn has ended.

When the call ends, `call.closing` lands on the call's thread. The task's last turn reads it, writes
the summary as its reply, and the step reports that reply to the conversation as a `report` message
that wakes it, because the `call.ended` notice told the conversation a summary follows. A last turn
that fails reports with no summary and names the call's task.

A call whose task is `failed`, `stopped`, `done` or `closed` runs no last turn. The transaction that
ends such a call writes the report itself, with no summary and the call's task named, in place of
`call.closing`. When the task stops after the call ended and before its last turn ran, the sweep
writes the same report for a call that ended in the last day. A task that has sent a report gets no
second one from either place.

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

## Limits of the speech layer

- The speech layer's instructions hold the voice-call prompt, never a memory block. Its small talk
  saves nothing to memory, and `dictated` text never counts as memory evidence.
- The speech layer answers small talk only, and hands every request to nixie's turn, so Claude
  writes each answer.
- One call runs at a time, because nixie works for one person.
- The user's call audio goes to OpenAI, as [decision 0014](../../decisions/0014-voice-pipeline.md)
  accepts.
- A changed voice, prompt or call setting applies from the next call.
- `models.roles` is a strict object, so an older release refuses a config that sets the `call` role.
  Remove the key before a rollback.

## Configuration

Both places that hold settings are optional.

- Set the `provider`, which is `gpt-live`, and the `credential`, a reference to a deployment secret
  in `connector_credentials`, in the `voice` section of the deployment config. Without the section,
  calls are off. A config whose credential the secrets file lacks starts, logs
  `calls.speech_credential_missing` and wires no adapter. The
  [voice setup guide](../../guides/voice-calls.md) gives the steps.
- The `voice/` folder of the [definitions](../core/definitions.md) holds `voice.yaml`, with `voice`,
  `hold_after_ms` and `price_per_minute`, and `lines.yaml`, with the fixed lines `holding`,
  `reconnect`, `couldnt_finish` and `budget`. Every key is optional. A missing key takes the default
  in the module, except `price_per_minute`, which has none.

A voice file that fails to parse never stops the server or the seed. The seed leaves the file
unapplied and logs `definitions.voice_file_skipped` with the file and its fault. Calls then use the
defaults, which hold no price, until the file is fixed. A file that is not UTF-8 text is reported
the same way, whatever the format, and a `price_per_minute` above 1000 dollars counts as a fault,
because its micros no longer add up exactly.
