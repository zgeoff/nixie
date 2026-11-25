# Voice calls

A call is a live voice conversation between the user and nixie. The `modules/calls` package owns the
call's state, its records, its price and the rule that a call ends when its budget runs out. It
never talks to a speech provider. It holds the `SpeechLayer` interface, and the server passes in an
adapter that implements it. The [voice design](../../design/platform/channels/voice.md) describes
the whole feature. This doc covers the module, its records, its budget and its configuration. The
server holds no speech adapter, so a server with a `voice` config section answers `calls.start` with
`SPEECH_UNAVAILABLE`.

## The speech layer

`SpeechLayer` is the whole of what the module asks of a provider:

- `open` takes the browser's SDP offer and the voice settings, and returns the SDP answer, a
  provider session ID and a stream of `SpeechEvent`s. A provider that refuses its credential returns
  a refusal in place of a session.
- `answer` and `say` tell the provider what to speak, and `close` ends the session.

The package's `test-utils` holds a fake layer in memory. It records each `open`, `answer`, `say` and
`close`, and a test emits each `SpeechEvent` into a session by hand.

## The call's states

A call is `ringing`, `connecting`, `live` or `ended`. An ended call carries who ended it: `you`,
`nixie`, `budget`, `missed`, `declined` or `dropped`.

| Step            | What happens                                                                                                                                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calls.start`   | A full-scope session starts a call. One write transaction checks the refusals, creates the call, asks the server's seam for the call task, and writes `call.started` and `call.answered`. The call is `connecting`, and the starting session carries it. |
| `calls.connect` | The carrying session sends its SDP offer. The module opens a speech session, and the transaction that makes the call `live` charges its first minute.                                                                                                    |
| `calls.hangUp`  | Ends the call with `endedBy: 'you'`. A second hang up of an ended call returns the same result.                                                                                                                                                          |

`calls.start` refuses with one of these errors, checked in this order:

| Error                 | When                                                                       |
| --------------------- | -------------------------------------------------------------------------- |
| `VOICE_OFF`           | The config holds no `voice` section.                                       |
| `SPEECH_UNAVAILABLE`  | The config holds `voice`, and the server wired no speech adapter.          |
| `VOICE_PRICE_MISSING` | `voice/voice.yaml` sets no `price_per_minute`. The message names the file. |
| `CALL_RUNNING`        | Another call has not ended.                                                |
| `CALL_BUDGET_REACHED` | `call-day` or `call-month` has no room for a minute.                       |

`calls.connect` refuses a call that does not exist, a session that does not carry the call and a
call that is already connected. When the provider refuses its credential, the call ends as
`dropped`.

A sweep closes the gaps that a crash or a silent provider leaves. Every 5 seconds it ends a call
that stayed `connecting` for 30 seconds, ends a `live` call whose speech session is gone, and
charges each further started minute of a live call.

## Records

Each call writes these record kinds. The model sees only `call.rang`, `call.spoke` and
`call.handed_off`, so only those carry a short ID from `createShortID`, and only they hold text that
the user can ask nixie to forget.

| Kind               | What it records                                                    |
| ------------------ | ------------------------------------------------------------------ |
| `call.rang`        | nixie rang the user, with its reason.                              |
| `call.started`     | A call began, who began it and the ID of its task.                 |
| `call.answered`    | The starting session answered the call.                            |
| `call.reconnected` | The speech session dropped and came back.                          |
| `call.ended`       | The call ended, with who ended it and how many minutes it charged. |
| `call.spoke`       | One spoken line, from the user or from nixie, with its line ID.    |
| `call.handed_off`  | A request that the call passed to the conversation.                |
| `call.heard_cut`   | The user cut nixie off, and how much of the line they heard.       |
| `call.turn_timed`  | How long a turn took, for the latency record.                      |

The `calls` projection folds `call.started`, `call.answered`, `call.ended` and `budget.charged` into
one row per call, in the same transaction as each record. A call is `live` once its first
`call_minute` charge exists, and its minute count is the number of those charges, so no record marks
the connection. The kinds `call.started`, `call.answered` and `call.ended` change the `tasks` live
topic, because a call is a task in the task list.

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
defaults, which hold no price, until the file is fixed.
