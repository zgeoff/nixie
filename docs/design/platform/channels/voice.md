# Voice calls

- **Status:** agreed
- **Work items:** [the call thread and the speech layer](https://linear.app/zgeoff/issue/GEO-2862),
  [the call screen](https://linear.app/zgeoff/issue/GEO-2863),
  [nixie rings you](https://linear.app/zgeoff/issue/GEO-2864),
  [tuning on real calls](https://linear.app/zgeoff/issue/GEO-1868)
- **Decision records:** [0014](../../../decisions/0014-voice-pipeline.md)
- **Spikes:**
  [GPT-Live over WebRTC with a sideband](../../../../research/gpt-live-sideband/results.md)

You talk to nixie in a call in the app, and nixie can ring you. GPT-Live hears and speaks the call
under [0014](../../../decisions/0014-voice-pipeline.md): it answers small talk itself, and it hands
each request to nixie's own turn, so Claude writes every answer and GPT-Live speaks it. A call runs
as its own thread beside the conversation, with nixie's persona and memory, and posts a summary to
the conversation when it ends.

Terms:

- **The speech layer** is GPT-Live's session: it hears you, takes turns and speaks.
- **A hand-off** is one request that the speech layer passes to nixie's turn.
- **The carrying device** is the device that started or answered the call. It holds the call's audio
  and its call screen.

## Shape

```mermaid
flowchart LR
  device[carrying device] -->|"audio, WebRTC"| live[GPT-Live session]
  server[nixie server] -->|"sideband: prompt, answers"| live
  live -->|"hand-off"| server
  server -->|"step"| call[call thread]
  call -->|"reply text"| server
  call -->|"summary at the end"| convo[conversation]
  convo -->|"task.message"| call
```

## Contracts

### Starting and answering a call

The device opens the call's audio straight to OpenAI over WebRTC. The server creates the session
with the deployment's key, and joins the same session over a sideband connection, so the key never
reaches a device.

```ts
// You start a call from the call screen.
const call = await nixie.calls.start({ clientActionID });
// → { callID: 'c_7Q2', state: 'connecting' }
//   or { error: 'CALL_RUNNING' | 'VOICE_OFF' | 'CALL_BUDGET_REACHED' }

// The device sends its WebRTC offer; the server creates the GPT-Live session with it.
const { sdpAnswer } = await nixie.calls.connect({ callID, sdpOffer });

// You answer a ring, or end a call from either side.
await nixie.calls.answer({ callID, clientActionID }); // → { callID, state: 'connecting' }
await nixie.calls.hangUp({ callID, clientActionID }); // idempotent
```

```ts
// Server side. calls module (new). Adapters: GPT-Live, and an in-memory fake for tests.
interface SpeechLayer {
  // Creates the session from the device's offer and opens the sideband. The session sets
  // `store: false`, client delegation, an acknowledgement delay, and a device data channel that
  // may receive and send no event.
  open(input: OpenSpeech): Promise<{ sdpAnswer: string; sessionID: string } | SpeechRefused>;
  // Sends one part of nixie's answer for a hand-off; the speech layer speaks it in its own words.
  // Each part is a complete statement, never empty and never a lead-in to more text. A hand-off
  // never closes on the provider's side: `final` marks the end inside nixie.
  answer(sessionID: string, handOffID: string, text: string, final: boolean): Promise<void>;
  // Sends a line for the speech layer to say now, such as the reconnect line.
  say(sessionID: string, text: string): Promise<void>;
  close(sessionID: string): Promise<void>;
  events(sessionID: string): AsyncIterable<SpeechEvent>;
}

interface OpenSpeech {
  sdpOffer: string;
  // The voice-call prompt, then the call's recent lines: your speech, the speech layer's small talk
  // and nixie's answers, trimmed to the newest that fit. Never a memory block.
  instructions: string;
  voice: string; // from definitions
}

type SpeechRefused = { error: 'VOICE_CREDENTIAL_REFUSED' | 'SPEECH_UNAVAILABLE' };

type SpeechEvent =
  // Your speech: the input transcript's slices up to a hand-off's offset, or up to 1 s of quiet.
  | { kind: 'heard'; text: string; startedAtMs: number; endedAtMs: number }
  | { kind: 'spoke'; text: string; heardChars: number } // the speech layer's own small talk
  // The provider's delegation holds no request text, so `request` is your speech since the last
  // hand-off, up to the delegation's offset.
  | { kind: 'hand_off'; handOffID: string; request: string }
  // You talked over a reply and it stopped. The provider reports no cut: the adapter raises one on
  // the first input slice while an answer plays, and estimates heardChars by aligning the output
  // transcript's words to the text it sent.
  | { kind: 'cut'; handOffID: string; heardChars: number }
  // The provider sends no warning before its session limit: the adapter raises this from a timer,
  // 5 minutes before the session's expiry.
  | { kind: 'session_ending' }
  | { kind: 'dropped' };
```

### The call thread

A call runs on a runner of its own, `call`, which runs the conversation's turn code on the call's
task. Each hand-off is one turn of the call's thread, which commits at its end as every step does.
The `call` runner gives a call what a started task lacks:

- A turn writes reply records, and the calls module sends their text to the speech layer as the turn
  writes it.
- A message that lands during a turn reaches it as a mid-turn message, and your speech cuts a model
  call in flight, as in the conversation.
- The runner claims from a pool of its own, so a call's turn never waits behind a conversation turn.
- The call holds one sandbox of its own from `connect` to its end, granted the `call` role's
  credential, so a hand-off never waits for a sandbox to start. The restart sweep keeps it while a
  call waits to reconnect, and the call's end destroys it.

```ts
// tasks module: the creation record's start for a task of the `call` runner.
type CallTaskStart = {
  runner: 'call';
  callID: string; // the call's short ID
  seedThrough: number; // the last conversation sequence the call's session opens with
};
```

- The session builder reads two threads for a call: the conversation's recent turns and summary
  through `seedThrough`, then the call's own thread. It gives the call the conversation's pinned
  memory, memory index and retrieval. A forget invalidates the call's session as it invalidates the
  conversation's, and the next turn rebuilds it.
- The call takes the conversation's prompt with the voice-call prompt after it, and the
  conversation's persona and tool list, without `call.ring`, `task.start` and `worker.run`, and with
  `call.hang_up`, which ends the call after the speech layer says the turn's last line. It can
  `task.message` the conversation. A memory write whose quote touches a `dictated` span becomes a
  proposal, as for any `dictated` text. A call gets no reminders and no compaction.
- The call's turns use the `call` model role, a new key of `models.roles`. Unset, a call uses the
  conversation's profile.
- Each `heard` event becomes one `owner_message` record on the call thread, with a short ID and one
  span of source `dictated` over its text. A `hand_off` starts a turn over the messages since the
  last turn. `call.handed_off` keeps the request as the adapter built it from your speech, for
  timing checks.
- The calls module sends a turn's reply text to the speech layer one whole sentence at a time, as
  the turn finishes each one, and sends `final: true` with the last. A turn that ends with no text
  sends a fixed line instead, because an empty part makes the speech layer invent an answer.
- A turn that fails, ends on a proposal or passes a limit sends the speech layer a fixed line that
  claims no outcome, such as "I couldn't finish that one". The fixed lines live in `voice/` in the
  definitions, and each one spoken is a `call.spoke` record.
- When the call ends, by any cause, the calls module writes a `task_message` of kind `report` to the
  conversation. It holds the summary that the call's last turn wrote. When that turn fails or cannot
  run, the report holds no summary and links the call's record.

```text
calls projection (calls module; one row per call)
call_id            short ID; the record key is a random UUID
task_id            the call's thread
state              'ringing' | 'connecting' | 'live' | 'ended'
carrying_session   the device session that started or answered the call
started_at, ended_at
```

`calls.connect` is a checked action from the carrying session alone. It refuses with
`CALL_NOT_FOUND`, `NOT_CARRYING_SESSION`, `CALL_CONNECTED`, `SPEECH_UNAVAILABLE` or
`VOICE_CREDENTIAL_REFUSED`. The server process holds the sideband.

Every new speech-layer session needs a fresh offer from the device. When the session limit is near,
a session drops or the server restarts, the server sends `call.reconnect` on the device's live
stream. The device makes an ICE-restart offer on its open peer connection, so the microphone grant
and the audio path stay, and sends it with a fresh `calls.connect`. The old session then closes
itself. After a restart, the device reconnects on its own when its live stream returns. The calls
module keeps the call for 30 s while it waits.

The call screen's captions come from nixie's live stream, never from the provider's data channel,
because that channel stays bound to the first session after a reconnect.

```text
call record kinds (log module; each holds plain payload fields only, unless marked erasable)
call.rang        callID, reason (erasable), deviceCount
call.started     callID, startedBy: 'you' | 'nixie', carryingSession
call.answered    callID, carryingSession
call.reconnected callID, cause: 'session_limit' | 'dropped' | 'restart'
call.ended       callID, endedBy: 'you' | 'nixie' | 'budget' | 'missed' | 'declined' | 'dropped', minutes
call.spoke       callID, text (erasable), speaker: 'speech_layer', model, heardChars
call.handed_off  callID, handOffID, request (erasable)
call.heard_cut   callID, handOffID, replyRecordID, heardChars
call.turn_timed  callID, handOffID, firstAudioMs, handOffWaitMs, cutOffByLayer, interruptedByYou
```

- `call.started`, `call.answered` and `call.ended` sit on the conversation's thread as inbox kinds,
  so each one wakes the conversation. `call.rang` sits on the thread that rang. Every other `call.*`
  record sits on the call's thread. The calls module owns the record kinds and the projection's
  migration. `carryingSession` is the device session's identity ID. `minutes` counts the minutes the
  call was open.
- The span schema in the client contract gains the source `dictated`. Only a call writes it.
- Before each hand-off, the calls module writes the speech layer's small talk since the last
  hand-off as `call.spoke` records, so the turn reads the call so far.
- nixie's answer is the turn's reply record, which carries its model and profile as every reply
  record does. `call.spoke` carries the speech layer's model, so you can tell who spoke each line of
  a call.
- When you talk over a reply, `call.heard_cut` marks how much of it you heard, counted in characters
  of the reply text the calls module sent the speech layer. The count is an estimate, because the
  speech layer paraphrases, and the device can play up to about 2 s past the start of your speech. A
  reader that feeds the model shows the reply up to that point and marks the rest unheard. A cut
  that arrives after the turn committed marks the committed reply.
- The turn reads `call.spoke` lines as the speech layer's words, never as nixie's own answers or
  promises.

### Ringing you

```ts
// A tool of the conversation and of every started task granted it, never of a call.
// It goes through the decision point.
await tools.call.ring({ reason: 'Your 3pm moved to 4pm and the venue changed' });
// → { callID: 'c_9K1', ringing: true }
//   or { refused: 'do_not_disturb' | 'quiet_hours' | 'call_running' | 'no_device' }
```

- A ring sends a web push, "nixie is calling", to every device session with a push subscription.
  Opening it opens the answer screen. The web client registers a service worker, and each device
  session saves its subscription with `nixie.push.subscribe({ subscription, clientActionID })`.
- A refused ring tells the model why, so it sends a message instead.
- An unanswered ring ends after `ring_seconds` as `missed`. The outcome reaches the ringing thread
  as a wake.

```ts
// Your setting, from the call screen's menu or the settings page.
await nixie.calls.setDoNotDisturb({ on: true, clientActionID });
```

```yaml
# deployment config (excerpt)
voice:
  provider: gpt-live
  credential: <deployment_reference> # same reference forms as every other credential
  ring_in_quiet_hours: false # true lets a ring through `quiet_hours`
  ring_seconds: 45 # an unanswered ring ends after this
  price_per_minute: 0.05 # US dollars per open minute; the budget charges it as the call runs
models:
  roles:
    call: <profile_id> # optional; unset, a call uses the conversation's profile
```

```text
definitions (excerpt)
voice/prompt.md   the voice-call prompt; nixie ships a default, a deployment's copy replaces it
voice/voice.yaml  voice: <provider voice name>, hold_after_ms: 1500
voice/lines.yaml  the fixed lines: holding, reconnect, couldn't finish, budget
budgets/call-day.yaml, budgets/call-month.yaml   counts: tool:call, limit in dollars
```

### The conversation during a call

- `call.started`, `call.answered` and `call.ended` each wake the conversation. When you start the
  call, one wake covers started and answered. The conversation may end each such turn silently.
- The conversation briefs the call with `task.message`. The call answers you at once from the recent
  turns, and the briefing reaches its turn as a mid-turn message.
- A task result or a reminder that lands during a call goes to the conversation, as at any time. The
  conversation forwards what matters with `task.message`, and the call reads it at its next
  hand-off.
- At the end, the call posts a summary to the conversation as a task report, and its full record
  stays readable as any task's does.

## Constraints

- Your call audio goes to OpenAI, off the host, as
  [0014](../../../decisions/0014-voice-pipeline.md#consequences) accepts.
- The deployment's speech credential never reaches a device. The server creates every session, and
  the device's data channel carries no event either way, so a device can neither read the
  instructions nor send a command to the session.
- A missing or refused speech credential stops a call at `calls.connect` with
  `VOICE_CREDENTIAL_REFUSED`, the call ends with `endedBy: 'dropped'`, and nixie keeps running.
- `calls.start` makes the caller's session the carrying session. A refused start writes nothing.
- GPT-Live's delegation event holds no request text. The adapter builds the request from the input
  transcript since the last hand-off, up to the delegation's offset.
- One call runs at a time, because nixie works for one person. A second start or ring gets
  `CALL_RUNNING`.
- The speech layer answers small talk only, and hands every request to nixie's turn.
- The speech layer never sees memory: its instructions hold the voice-call prompt and the call so
  far. Small talk saves nothing to memory, and `dictated` text never counts as memory evidence.
- The speech layer's filler never says yes, never claims a result and never makes a promise. Its own
  acknowledgement of a hand-off can promise, so the adapter holds it with the acknowledgement delay
  and an empty thinking part, and the speech layer stays quiet while nixie's turn runs.
- When nixie's answer has not started `hold_after_ms` after a hand-off, the calls module sends the
  fixed holding line from `voice/`, such as "One moment." On a long turn, nixie's turn may send one
  interim line.
- The speech layer may speak nixie's answer as a close paraphrase. The tuning pass measures how far
  its wording drifts.
- A second request during a running hand-off joins that turn as a mid-turn message.
- When you talk over a reply, the speech layer stops itself, the calls module interrupts the running
  turn, and `call.heard_cut` records the point. You can always cut nixie off.
- A proposal made during a call shows its card on the carrying device's call screen, as
  [approvals in the client](approvals.md#during-a-voice-call) describes.
- A crash or a dropped provider session never replays a hand-off that committed. The calls module
  opens a new speech-layer session with the call so far, the speech layer says "I dropped out for a
  second", and a hand-off that was running reruns as its step does. You hear the rerun's answer in
  full, even a part you heard before the drop, and the record keeps only the answer its step
  committed.
- A provider session lasts at most 2 hours. 5 minutes before it ends, the calls module moves the
  call to a new session through the device, between hand-offs, and the speech layer says the
  reconnect line.
- When 3 attempts to open the next session fail, or the device and the speech session are both gone
  for 30 s, the call ends with `endedBy: 'dropped'`, and a new call can start.
- The calls module charges `price_per_minute` as one `budget.charged` record for each started
  minute, with a new charge purpose, `call_minute`. It registers `call-day` and `call-month` as
  built-in budgets, at $5 a day and $50 a month, as a paid tool's budgets are. The first minute
  charges in the `connect` transaction, and a call that never connects charges nothing. A minute
  that does not fit the budget charges nothing and ends the call. `calls.start` checks both budgets
  before it creates anything. When a budget is reached, nixie says so and the call ends with
  `endedBy: 'budget'`. The call's Claude turns count toward the spending stop as every turn does. A
  ring charges nothing.
- A config without the `voice` key turns calls off: `calls.start` answers `VOICE_OFF`, and nixie
  holds no `call.ring` tool.
- A call that stays `connecting` for 30 s with no `calls.connect` ends with `endedBy: 'dropped'`.
- Every speech-layer session sets `store: false`, so OpenAI keeps no session to fork or download.
  OpenAI still keeps the call for 30 days for abuse monitoring, as
  [0014](../../../decisions/0014-voice-pipeline.md#consequences) accepts.
- A changed voice, prompt or call setting applies from the next call.
- The turn-input log can cover the `call` role. The speech layer's own traffic never passes the
  model gateway and stays outside the log.
- `call.turn_timed` holds timings and flags only, never audio or text.
- `models.roles` is a strict object, so an older release without the `call` role refuses a config
  that sets it. Remove the key before a rollback.

## Decisions

- **A call is its own thread, on a `call` runner that runs the conversation's turn code.** The
  conversation stays free during a call, the call's record stays readable as a task's, and the call
  keeps the conversation's mid-turn messages and a sandbox held for its whole length.
- **Each hand-off is one turn.** A turn commits at its end, so a crash reruns only the hand-off that
  was running, and never one that committed.
- **The device carries the audio, the server holds the key.** Audio takes the shortest path, and the
  key stays on the host.
- **The call model is its own role, `call`.** It defaults to the conversation's profile.
- **The speech layer keeps its own turn-taking and echo handling.** The device's browser cancels
  echo. Tuning on real calls follows the build.
- **Ringing goes through the decision point.** A ring interrupts you, and a rule at the decision
  point can hold it.

## Builder decides

- The names of the calls module's internal functions and files.
- The call screen's and the answer screen's layout and wording.
- How many recent turns seed a call.
- The interim line's timing on a long turn.
- The default voice-call prompt's wording, within the constraints above.

## Out of scope

- Calls over the phone network. A call runs in the app.
- A second speech provider. The `SpeechLayer` interface leaves room for one.
- Asking OpenAI for zero retention. `store: false` applies now.
- A signal that you are not alone. nixie rings and talks the same either way.
- Tuning the speech layer's settings, which
  [the tuning pass](https://linear.app/zgeoff/issue/GEO-1868) does on real calls.
