# Results: GPT-Live's delegation and cuts over WebRTC with a sideband

Each probe held a real WebRTC call: headless Chromium offered audio, the probe's server created the
session with the deployment's key and attached the sideband, and synthetic speech played into the
browser's microphone. Every event from the sideband and from the browser's data channel went to a
log. The excerpts below come from those logs, with IDs shortened; times in brackets are `start_ms`
and `end_ms` on GPT-Live's session timeline.

## Setup

| Item    | Value                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Models  | `gpt-live-1`, the model in [0014](../../docs/decisions/0014-voice-pipeline.md), and `gpt-live-1.1`, the model OpenAI's WebRTC quickstart now uses |
| Device  | Chromium from `playwright-core` 1.65.1, headless, one `RTCPeerConnection` with a WebAudio microphone and the `oai-events` data channel            |
| Server  | `POST /v1/live/sessions` with `transport: { type: 'webrtc', sdp }`, then `wss://api.openai.com/v1/live/sessions/<session_id>/attach`              |
| Session | `delegation: { type: 'client' }`, `store: false`, a short voice prompt that hands every request to the backend, voice `marin`                     |
| Speech  | OpenAI `tts-1`, voice `alloy`, PCM16 at 24 kHz, synthetic lines written for the spike                                                             |

The probes:

- `delegation` greets, asks for tomorrow's calendar and answers in 3 parts, sends a late part 6 s
  after GPT-Live goes quiet, asks for a reminder and leaves it unanswered for 15 s, then sends an
  empty part, a real answer, and a part for an unknown delegation ID.
- `cut` asks 3 questions, answers each with a 330-character reply, and talks over the reply once
  GPT-Live has said 40, 110 and 180 characters of it.
- `reconnect` restricts the device's data channel and has the device send a command, sends the first
  offer again, moves the call to a new session with an ICE-restart offer from the same peer
  connection, and asks to fork the first session.
- `quiet` sets `acknowledgement_delay_ms: 800`, answers each of 2 delegations at once with an empty
  `session.thinking.append`, sends the answer 8 s later, and then sends a line as a commentary part
  with a null delegation ID.

Sessions and their billed seconds, from `session.closed`:

| Probe                                                    | Model          | Billed seconds |
| -------------------------------------------------------- | -------------- | -------------- |
| first connection check                                   | `gpt-live-1.1` | about 15       |
| `delegation`                                             | `gpt-live-1`   | 74             |
| `cut`, crashed before its first line                     | `gpt-live-1`   | 15             |
| `cut`                                                    | `gpt-live-1`   | 63             |
| `reconnect`: first session, reused offer, second session | `gpt-live-1`   | 15 + 15 + 15   |
| `delegation`                                             | `gpt-live-1`   | 73             |
| `delegation`                                             | `gpt-live-1.1` | 69             |
| `cut`                                                    | `gpt-live-1.1` | 58             |
| `quiet`                                                  | `gpt-live-1`   | 41             |

The total is about 453 s, 7.6 minutes, or $0.38 at $0.05 a minute. The synthetic speech cost under
$0.01.

## Question 1: the request's text

`session.delegation.created` holds no request text, on the sideband and on the data channel alike.
Every delegation in every probe had this shape:

```json
{
  "type": "session.delegation.created",
  "offset_ms": 12000,
  "delegation": { "id": "item_EnuBq…", "type": "delegation", "target": "client" }
}
```

The request is in the input transcript. In 13 of 13 delegations, `offset_ms` fell between the start
of the request's last transcribed word and 600 ms after that word's end:

```text
heard [10800-11000] " What's on"   … heard [11400-11600] " tomorrow"   heard [12000-12200] " morning"
session.delegation.created offset_ms 12000
heard [46400-46600] " plants"   heard [46800-47000] " tonight"
session.delegation.created offset_ms 47400
```

The adapter builds the request from the `session.input_transcript.delta` events whose `start_ms` is
at or before `offset_ms`, since the last hand-off. The OpenAI reference says the same: the
delegation object "contains metadata, not the task text".

Transcript deltas arrive in 200 ms slices with no event that ends a turn. In one session, an input
delta `" Done"` arrived at the moment an empty commentary part was acknowledged, though the
microphone carried silence then.

## Question 2: an answer in parts

GPT-Live took several parts on one delegation ID and spoke each after its
`session.commentary.appended` acknowledgement, with one exception below. Nothing in the API closes a
delegation: a part sent 6 s after GPT-Live had finished the answer was spoken in full in 3 of 3
sessions.

```text
session.commentary.append  late_part  "One more thing: the dentist asked you to arrive ten minutes early."
session.commentary.appended [35600-35800]
said [35600-37800] " Oh, and the dentist asked you to arrive 10 minutes early."
```

A part that leads in to facts still to come makes GPT-Live invent them. The first part, "Tomorrow
morning you have two things.", was followed by invented meetings in 3 of 3 sessions, before the real
items arrived:

| Model          | Said after the lead-in part                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `gpt-live-1`   | "Tomorrow morning, you have a team sync at 9:00 and a one-on-one at 10:30."                                   |
| `gpt-live-1`   | "Tomorrow morning you have a Team sync from nine to 9:30,"                                                    |
| `gpt-live-1.1` | "Tomorrow at 9 a.m., there's a team stand-up." It then placed the dentist at 10:30, where the part said nine. |

An empty part is acknowledged and makes GPT-Live invent a result. On the reminder that nixie had not
answered, an empty part drew "Done. You'll get a reminder tonight to water the plants.", "Okay! I'll
remind you tonight at seven to water the plants." and "All set. I'll remind you tonight to water the
plants." The real answer said eight.

An acknowledgement is not delivery. In the `gpt-live-1.1` session, the real reminder answer got its
`session.commentary.appended`, and GPT-Live said nothing in the 6 s before the session closed: it
had already claimed the result after the empty part. So "at eight" never reached you, and only the
output transcript shows what was said.

While the reminder waited 15 s with no answer, GPT-Live's automatic acknowledgement said "Sure, I'll
set that up." in 2 of 3 sessions, and "Sure!" in the third.

OpenAI's documented way to stop that acknowledgement works. With `acknowledgement_delay_ms: 800` and
an empty `session.thinking.append` sent as soon as the delegation arrived, GPT-Live stayed silent
for the 8 s until the answer, on 2 of 2 delegations. Unlike an empty commentary part, the empty
thinking part drew no invented result.

A commentary part with `delegation_id: null`, as `say` would send, is spoken, with GPT-Live's own
words around it. "I dropped out for a second." came out as "Sorry, I dropped out for a second—want
me to check for any new messages again?"

A part for an unknown delegation ID is refused:

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "Unknown client or Decision delegation.",
    "param": "delegation_id",
    "client_event_id": "unknown_id"
  }
}
```

So nixie can send one answer in several parts, but the last part closes nothing at GPT-Live. Each
part must be a complete statement of facts, an empty commentary part must never go out, and the
adapter learns what was spoken only from the output transcript.

## Question 3: a cut

No event reports a cut. In each of the 6 trials, no event of a type other than transcript, audio,
usage and the probe's own marks arrived within 5 s of the cut, and the reference lists no truncation
event. GPT-Live stops its output where your speech starts on the session timeline, says a short line
such as "Sure, pausing.", and did not resume the answer in the 6 s before the next question.

The adapter can still find the cut and the heard text from the sideband:

1. The cut is the first `session.input_transcript.delta` while GPT-Live is speaking a commentary.
   Its `start_ms` is the cut point.
2. The reflected `session.output_audio.delta` events stop at that point, within 400 ms in 6 of 6
   trials.
3. The heard text is the `session.output_transcript.delta` text from the commentary's
   `appended.start_ms` up to the cut point.
4. GPT-Live paraphrases, so the heard text is not a prefix of what nixie sent.
   [`pickHeardChars`](pick-heard-chars.ts) aligns the words, and counts the sent text up to the last
   spoken word.
5. Transcript deltas carry no delegation ID. The adapter knows the hand-off from the commentary it
   last sent.

| Model          | Trial | Cut at   | Output audio ends | Event naming the cut | Spoken before the cut                                                                                                                                                                                  | heardChars / sent | Speaker quiet after |
| -------------- | ----- | -------- | ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------------------- |
| `gpt-live-1`   | 1     | 9200 ms  | 9200 ms           | none                 | "You have four things this week. On Monday, the plumber is coming between eight and ten."                                                                                                              | 82 / 334          | 1299 ms             |
| `gpt-live-1`   | 2     | 29400 ms | 29200 ms          | none                 | "You have three unread messages. The first is from the school, saying the trip to the museum moved to next Thursday,"                                                                                  | 114 / 331         | 1363 ms             |
| `gpt-live-1`   | 3     | 56400 ms | 56800 ms          | none                 | "Today stays dry, with sunny spells and a high of seventeen degrees. Tomorrow it brings rain from mid-morning, clearing by evening. Saturday is cooler, around twelve degrees, with a strong-"         | 225 / 337         | 2029 ms             |
| `gpt-live-1.1` | 1     | 7200 ms  | 7400 ms           | none                 | "week. You've got four things this week. On"                                                                                                                                                           | 30 / 334          | 1969 ms             |
| `gpt-live-1.1` | 2     | 26800 ms | 26800 ms          | none                 | "new messages. You've got three unread. First is from the school, saying the trip to the museum moved to next"                                                                                         | 105 / 331         | 1889 ms             |
| `gpt-live-1.1` | 3     | 51600 ms | 51600 ms          | none                 | "Today stays dry with sunny spells and a high of seventeen degrees. Tomorrow brings rain from mid-morning, heavy at times, clearing by the evening. Saturday is cooler, around twelve degrees, with a" | 218 / 337         | 2264 ms             |

"Speaker quiet after" is the time from the start of the interrupting line to the device's speaker
going quiet, on the device's own clock. You hear 1.3 to 2.3 s of overlap, as the
[reply run](../voice-latency/voice-reply.md#barge-in) measured over one WebSocket. The 1.1 trials'
spoken text starts with the end of GPT-Live's own acknowledgement, which overlapped the commentary's
start.

## Question 4: session fields

The session that turns client delegation on, as the server created it:

```json
{ "model": "gpt-live-1", "instructions": "…", "delegation": { "type": "client" }, "store": false }
```

- The `session.started` and `session.closed` snapshots echo `"delegation": { "type": "client" }` and
  `"store": false`. The reference says an omitted delegation also selects client mode; the spike set
  it.
- WebRTC negotiates the audio format, so the session omits `audio.format`. The HTTP request starts
  the session, so nothing sends `session.start`.
- `store` decides only whether OpenAI keeps the session for forking and recording download. OpenAI's
  [data controls page](https://developers.openai.com/api/docs/guides/your-data) lists
  `/v1/live/sessions` with 30 days of abuse-monitoring retention whatever `store` says, and no
  application state unless stored.
- Without restrictions, the device's data channel received every event, including `session.started`
  with the full instructions and each `session.delegation.created`. The reference says an omitted
  `allowed_client_events` keeps "the existing allow-all behavior", so the device could also send any
  command; the spike did not try one on an open channel.
- `client.data_channel` closes that. With `allowed_client_events: []` and only the two transcript
  events allowed out, the device got `{"type":"info","code":"data_channel_permissions"}` at start,
  and its own `session.commentary.append` was refused with `event_not_allowed`. The sideband was
  unaffected.

## Question 5: a new session for the same call

Every session's `expires_at` came 7,200 s after it started, so a session lasts 2 hours. The
reference lists no event that warns of the limit: `session.closed` with reason `expired` arrives
when it is reached. The spike did not reach it. Separately, GPT-Live replaces its own engine inside
the session when context passes 90%, and `session.usage.updated` reports
`context_window.usage_ratio`.

The server cannot open the next session alone. Each new WebRTC session needs an SDP offer from the
device:

- Sending the first offer again was accepted, with HTTP 201, and made a session that never carried
  audio and billed 15 s.
- A fork of the first session was refused, because `store: false` keeps nothing to fork from:
  `400 The stored session was not found.`
- An ICE-restart offer from the device's open peer connection carried audio both ways. The new
  session's answer applied, the peer was `connected` 410 ms later, and the first session closed
  itself 110 ms after that with reason `remote_hangup`. The new session, seeded through `input`,
  heard the next question and delegated it, and its spoken "Checking that." reached the device's
  speaker 9.0 to 9.6 s after the swap.
- The device's data channel received no event from the new session, though that session allowed the
  transcript events out. The channel stayed bound to the first session.

```text
restart_offer_result   created, a new session ID
peer connecting → connected (410 ms)
first session: session.closed reason "remote_hangup"
new session: heard [400-1400] "What's my favourite colour" → session.delegation.created offset_ms 2000
new session: said [2400-2800] "Checking that."   device speaker loud 9.0–9.6 s after the swap
device data channel: no events after the swap
```

So a reconnect needs a round trip to the device. The same peer connection and microphone grant carry
the audio of the new session, but the device's captions need another route, such as a new data
channel or nixie's own live stream; the spike tried neither.

## Contract lines that must change

Each line below is quoted from [Voice calls](../../docs/design/platform/channels/voice.md), with the
reason it no longer holds.

1. The comment on `answer` in the `SpeechLayer` interface:

   ```ts
   // Sends one part of nixie's answer for a hand-off; the speech layer speaks it. The last part sets
   // `final`, which closes the hand-off.
   ```

   GPT-Live has no close for a delegation and accepts any later part, and an acknowledged part can
   go unspoken. `final` can only mark the end inside nixie, and the adapter must read what was
   spoken from the output transcript.

2. "The calls module sends a turn's reply text to the speech layer in parts as the turn writes it,
   and sends `final: true` with the last part." A part that leads in to more text makes GPT-Live
   invent the rest. Each part must be a complete statement, such as a whole sentence of facts.
3. "Every hand-off gets a final part, even when the turn wrote no text, so the speech layer never
   waits on it." An empty part made GPT-Live claim a result in 3 of 3 sessions. A turn with no text
   must send a fixed line from `voice/`.
4. "The adapter takes a hand-off's request from GPT-Live's delegation event. When the event holds no
   request text, the adapter uses your speech since the last hand-off." The event never holds
   request text. The adapter always takes the input transcript up to `offset_ms`.
5. "`call.handed_off` keeps the speech layer's wording of the request, for timing and fidelity
   checks." GPT-Live never words the request. The record can keep only your transcribed speech.
6. The comment on the `cut` event in `SpeechEvent`:

   ```ts
   // You talked over a reply and it stopped. The adapter counts heardChars from the timing of the
   // speech layer's output transcript.
   ```

   No event reports the cut. The adapter detects it from the first input transcript delta during a
   commentary, and aligns the output transcript's words to the sent text.

7. "When you talk over a reply, `call.heard_cut` marks how much of it you heard, counted in
   characters of the reply text the calls module sent the speech layer." GPT-Live paraphrases, so
   the count is an estimate from word alignment, and the device plays 1.3 to 2.3 s past the start of
   your speech.
8. `| { kind: 'session_ending' } // the provider's session limit is near` GPT-Live sends nothing
   before the limit. The adapter raises this event from a timer on `expires_at`, 2 hours after the
   start.
9. "When the provider's session limit is near, the calls module opens the next session inside the
   same call, and you hear no gap beyond the reconnect line." The move needs the device to send an
   ICE-restart offer, the device's data channel goes quiet after it, and the spike did not measure
   the audio gap.
10. "Every speech-layer session sets `store: false`, so OpenAI keeps no copy of the call for later
    use." `store: false` keeps no stored session for forking or download, but abuse monitoring keeps
    the call for 30 days.
11. "The speech layer's filler never says yes, never claims a result and never makes a promise."
    GPT-Live's automatic acknowledgement said "Sure, I'll set that up." in 2 of 3 sessions. The
    constraint holds only when the adapter sets `acknowledgement_delay_ms` and sends an empty
    `session.thinking.append` on each delegation, which kept GPT-Live silent on 2 of 2 delegations,
    and nixie sends its own holding line.
12. "The deployment's speech credential never reaches a device. The server creates every session."
    The key stays on the server, but the device's data channel receives every event, and the
    reference lets it send any command. The server must set `client.data_channel` to allow the
    device only the transcript events it shows.
13. "Each `heard` event becomes one `owner_message` record on the call thread, with a short ID and
    one span of source `dictated` over its text." GPT-Live sends your speech as 200 ms transcript
    slices with no event that ends a turn. The adapter must group them into one `heard` event, such
    as all slices up to a delegation's `offset_ms` or up to a quiet gap, and the contract must say
    which.

"Every new speech-layer session needs a fresh offer from the device." holds, as Question 5 shows.

## Untested

- Real microphones, echo, noise and a phone's network.
- The audio gap while the device moves to a new session, and a reconnect at the real 2-hour limit.
- `session.instructions.append` as a way to stop GPT-Live mid-sentence.
- A new data channel, or another route for captions, after the device moves to a new session.
- Sending a command from a device whose data channel is not restricted.
- A second request while a hand-off is running.
- A session that omits `delegation`, and a session seeded with a long call through `input`.
- How the device's playback delay varies, beyond the 6 trials here.
