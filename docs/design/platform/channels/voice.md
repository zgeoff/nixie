# Voice calls

- **Status:** agreed. The intro below says which part is built.
- **Work items:** [the call screen](https://linear.app/zgeoff/issue/GEO-2863),
  [nixie rings you](https://linear.app/zgeoff/issue/GEO-2864),
  [tuning on real calls](https://linear.app/zgeoff/issue/GEO-1868)
- **Decision records:** [0014](../../../decisions/0014-voice-pipeline.md)
- **Spikes:**
  [GPT-Live over WebRTC with a sideband](../../../../research/gpt-live-sideband/results.md)

You talk to nixie in a call in the app, and nixie can ring you. GPT-Live hears and speaks the call
under [0014](../../../decisions/0014-voice-pipeline.md): it answers small talk itself, and it hands
each request to nixie's own turn, so Claude writes the answer to every request and GPT-Live speaks
it. A call runs as its own thread beside the conversation, with nixie's persona and memory, and
posts a summary to the conversation when it ends.

The call thread, the speech layer and its GPT-Live adapter, the hand-offs, the call records, the
per-minute charge, the call screen without captions, the call bar and a call's reconnect are built.
Read [Voice calls](../../../architecture/channels/calls.md) and
[the client](../../../architecture/channels/client.md#the-call) for them. Three things are left to
build: answering a ring, captions on the built call screen, and ringing you.

Build those three under the work item [nixie rings you](https://linear.app/zgeoff/issue/GEO-2864),
from the contracts and constraints below. The owner reviews the design here. The screen that is
already built belongs to the work item [the call screen](https://linear.app/zgeoff/issue/GEO-2863).
[Tuning on real calls](https://linear.app/zgeoff/issue/GEO-1868) has a work item of its own and
follows the build.

Terms:

- **The speech layer** is GPT-Live's session: it hears you, takes turns and speaks.
- **A hand-off** is one request that the speech layer passes to nixie's turn.
- **`say`** is the speech layer's method that sends one line for it to speak as its own words. It is
  not part of a hand-off's answer. [Voice calls](../../../architecture/channels/calls.md) holds its
  contract.
- **The decision point** is the host's check that every tool call passes before it runs. Read
  [the decision point](../../../architecture/policy/decision-point.md) for it.
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
  server -->|"ring"| device
```

## Contracts

### The device's side of a call

```ts
// You answer a ring. `calls.start`, `calls.connect` and `calls.hangUp` are built, and the call
// screen starts a call with them.
await nixie.calls.answer({ callID, clientActionID }); // → { callID, state: 'connecting' }
```

The call screen shows each caption as its record arrives on nixie's live stream for the call's
thread. It never reads a caption from the provider's data channel, which stays bound to the first
session after a reconnect. A reconnect therefore cannot cut the captions off. The captions come from
two records, so they need no new record kind and no new method:

- what you said is the dictated `owner_message` that each `heard` event becomes, as
  [Voice calls](../../../architecture/channels/calls.md) describes;
- what the speech layer said in its own words is a `call.spoke` record.

```text
call record kinds not written yet (log module). Every field is plain except `reason`, which is erasable.
call.rang        callID, reason (erasable), deviceCount
call.turn_timed  callID, handOffID, firstAudioMs, handOffWaitMs, cutOffByLayer, interruptedByYou
```

- nixie writes `call.rang` on the thread that rang, so that thread's history shows it, and
  `call.turn_timed` on the call's thread, beside the turns it times.
- `reason` is the text the model passed to `tools.call.ring`. When you ask nixie to forget it, the
  record keeps its call ID and device count, and the reason shows as forgotten.
  [Erasable fields](../../../architecture/core/erasable-fields.md) explains how a field is erased.
- `call.turn_timed` holds timings and flags only, never audio or text, so the tuning pass can read
  it without reading what you said.

### Ringing you

```ts
// A tool of the conversation and of every started task granted it, never of a call.
// It goes through the decision point.
await tools.call.ring({ reason: 'Your 3pm moved to 4pm and the venue changed' });
// → { callID: 'c_9K1', ringing: true }
//   or { refused: 'do_not_disturb' | 'quiet_hours' | 'call_running' | 'no_device' }
```

- A ring sends a web push, "nixie is calling", to every device session with a push subscription.
  Opening it shows the answer screen for the ringing call, and the screen answers with
  `calls.answer`. The web client registers a service worker, and each device session saves its
  subscription with `nixie.push.subscribe({ subscription, clientActionID })`.
- A refused ring tells the model why, so it sends a message instead.
- An unanswered ring ends after `ring_seconds` as `missed`. The outcome reaches the ringing thread
  as a wake.

```ts
// Your setting, from the call screen's menu or the settings page.
await nixie.calls.setDoNotDisturb({ on: true, clientActionID });
```

```yaml
# deployment config (excerpt: the keys not built yet, beside provider and credential)
voice:
  ring_in_quiet_hours: false # true lets a ring through `quiet_hours`
  ring_seconds: 45 # an unanswered ring ends after this
```

## Constraints

- On a long turn, nixie's turn may send one interim line through `say`, which never makes a promise
  and is never part of the answer.
- The speech layer may speak nixie's answer as a close paraphrase. The tuning pass measures how far
  its wording drifts.
- A ring charges nothing.
- The device's browser cancels echo, and the speech layer keeps its own turn-taking. Tuning on real
  calls follows the build.

## Decisions

- **Ringing goes through the decision point.** A ring interrupts you, and a rule at the decision
  point can hold it.

## Builder decides

- The call screen's and the answer screen's layout and wording.
- The interim line's timing on a long turn.

## Out of scope

- Calls over the phone network. A call runs in the app.
- A second speech provider. The `SpeechLayer` interface leaves room for one.
- Asking OpenAI for zero retention. `store: false` applies now.
- A signal that you are not alone. nixie rings and talks the same either way.
- Tuning the speech layer's settings, which
  [the tuning pass](https://linear.app/zgeoff/issue/GEO-1868) does on real calls.
