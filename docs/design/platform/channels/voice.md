# Voice calls

- **Status:** agreed
- **Decision records:** [0014](../../../decisions/0014-voice-pipeline.md)

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
//   or { error: 'CALL_RUNNING' | 'VOICE_OFF' | 'CALL_BUDGET_REACHED' | 'VOICE_CREDENTIAL_REFUSED' }

// The device sends its WebRTC offer; the server creates the GPT-Live session with it.
const { sdpAnswer } = await nixie.calls.connect({ callID, sdpOffer });

// You answer a ring, or end a call from either side.
await nixie.calls.answer({ callID, clientActionID }); // → { callID, state: 'connecting' }
await nixie.calls.hangUp({ callID, clientActionID }); // idempotent
```

```ts
// Server side. calls module (new). Adapters: GPT-Live, and an in-memory fake for tests.
interface SpeechLayer {
  // Creates the session from the device's offer, with `store: false`, and opens the sideband.
  open(input: OpenSpeech): Promise<{ sdpAnswer: string; sessionID: string } | SpeechRefused>;
  // Sends nixie's answer for a hand-off; the speech layer speaks it.
  answer(sessionID: string, handOffID: string, text: string): Promise<void>;
  // Sends a line for the speech layer to say now, such as the reconnect line.
  say(sessionID: string, text: string): Promise<void>;
  close(sessionID: string): Promise<void>;
  events(sessionID: string): AsyncIterable<SpeechEvent>;
}

interface OpenSpeech {
  sdpOffer: string;
  instructions: string; // the voice-call prompt and the call so far; never a memory block
  voice: string; // from definitions
}

type SpeechRefused = { error: 'VOICE_CREDENTIAL_REFUSED' | 'SPEECH_UNAVAILABLE' };

type SpeechEvent =
  | { kind: 'heard'; text: string; startedAtMs: number; endedAtMs: number } // your speech
  | { kind: 'spoke'; text: string; heardUntilMs: number } // the speech layer's own small talk
  | { kind: 'hand_off'; handOffID: string; request: string }
  | { kind: 'cut'; heardChars: number } // you talked over a reply; it stopped
  | { kind: 'session_ending' } // the provider's session limit is near
  | { kind: 'dropped' };
```

### The call thread

A call is a task of kind `call`. It keeps nixie's persona and memory, and it starts from the recent
turns of the conversation. Each hand-off is an ordinary step of the call's task, which commits at
its end, as every task step does.

```ts
// Written by the calls module when a call connects.
type CallTaskStart = {
  kind: 'call';
  callID: string;
  seed: { fromSequence: number }; // the conversation's recent turns, as a rebuilt session reads them
  role: 'call'; // the model role in models.roles; unset, it uses the conversation's profile
};
```

```text
call record kinds (log module; each holds plain payload fields only, unless marked erasable)
call.rang        callID, reason (erasable), deviceCount
call.started     callID, startedBy: 'you' | 'nixie', carryingSession
call.answered    callID, carryingSession
call.reconnected callID, cause: 'session_limit' | 'dropped' | 'restart'
call.ended       callID, endedBy: 'you' | 'nixie' | 'budget' | 'missed' | 'declined' | 'dropped', minutes
call.spoke       callID, text (erasable), speaker: 'speech_layer', model, heardChars
call.heard_cut   callID, replyRecordID, heardChars
call.turn_timed  callID, firstAudioMs, handOffWaitMs, cutOffByLayer, interruptedByYou
```

- Your speech becomes a message record on the call thread, each span with source `dictated`.
- Before each hand-off, the calls module writes the speech layer's small talk since the last
  hand-off as `call.spoke` records, so the turn reads the call so far.
- nixie's answer is the turn's reply record, which carries its model and profile as every reply
  record does. `call.spoke` carries the speech layer's model, so every line of a call names who
  spoke it.
- When you talk over a reply, `call.heard_cut` marks how much of it you heard, counted in characters
  of the reply text the calls module sent the speech layer. A reader that feeds the model shows the
  reply up to that point and marks the rest unheard. A cut that arrives after the turn committed
  marks the committed reply.
- The turn reads `call.spoke` lines as the speech layer's words, never as nixie's own answers or
  promises.

### Ringing you

```ts
// A tool of the conversation and of every task that holds it; it goes through the decision point.
await tools.call.ring({ reason: 'Your 3pm moved to 4pm and the venue changed' });
// → { callID: 'c_9K1', ringing: true }
//   or { refused: 'do_not_disturb' | 'quiet_hours' | 'call_running' | 'no_device' }
```

- A ring sends a web push, "nixie is calling", to every device session with a push subscription.
  Opening it opens the answer screen.
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
voice/voice.yaml  voice: <provider voice name>
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
- The deployment's speech credential never reaches a device. The server creates every session.
- A missing or refused speech credential stops a call at start with `VOICE_CREDENTIAL_REFUSED`, and
  nixie keeps running.
- One call runs at a time. A second start or ring gets `CALL_RUNNING`.
- The speech layer answers small talk only, and hands every request to nixie's turn.
- The speech layer never sees memory: its instructions hold the voice-call prompt and the call so
  far. Small talk saves nothing to memory, and `dictated` text never counts as memory evidence.
- The speech layer's filler never says yes, never claims a result and never makes a promise. On a
  long turn, nixie's turn may send one interim line.
- A second request during a running hand-off joins that turn as a mid-turn message.
- When you talk over a reply, the speech layer stops itself, the calls module interrupts the running
  turn, and `call.heard_cut` records the point. You can always cut nixie off.
- A proposal made during a call shows its card on the carrying device's call screen, as
  [approvals in the client](approvals.md#during-a-voice-call) describes.
- A crash or a dropped provider session never replays speech you heard. The calls module opens a new
  speech-layer session with the call so far, the speech layer says "I dropped out for a second", and
  a hand-off that was running reruns as its step does. You hear the rerun's answer in full, and the
  record keeps only the answer its step committed.
- When the provider's session limit is near, the calls module opens the next session inside the same
  call, and you hear no gap beyond the reconnect line.
- When 3 attempts to open the next session fail, or the device and the speech session are both gone
  for 30 s, the call ends with `endedBy: 'dropped'`, and a new call can start.
- The call budget charges `price_per_minute` each minute the call is open, under `call-day` and
  `call-month`, with the defaults every paid tool has: $5 a day and $50 a month. When a budget is
  reached, nixie says so and the call ends with `endedBy: 'budget'`. The call's Claude turns count
  toward the spending stop as every turn does.
- Every speech-layer session sets `store: false`.
- A changed voice, prompt or call setting applies from the next call.
- The turn-input log can cover the `call` role. The speech layer's own traffic never passes the
  model gateway and stays outside the log.
- `call.turn_timed` holds timings and flags only, never audio or text.
- `models.roles` is a strict object, so a release without the `call` role refuses a config that sets
  it. The build issue that adds the role says a rollback removes the key first.

## Decisions

- **A call is its own thread.** The conversation stays free during a call, and the call's record
  stays readable as a task's.
- **Each hand-off is an ordinary step.** A step commits at its end, so a crash reruns one hand-off
  and never the speech you heard.
- **The device carries the audio, the server holds the key.** Audio takes the shortest path, and the
  key stays on the host.
- **The call model is its own role, `call`.** It defaults to the conversation's profile.
- **The speech layer keeps its own turn-taking and echo handling.** The device's browser cancels
  echo. Tuning on real calls follows the build.
- **Ringing goes through the decision point.** A ring interrupts you, so a rule can hold it.

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
