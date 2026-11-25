# Spike: GPT-Live's delegation and cuts over WebRTC with a sideband

This spike holds a GPT-Live call in the setup that
[Voice calls](../../docs/design/platform/channels/voice.md) designs: headless Chromium carries the
audio over WebRTC, and a server joins the same session over the sideband WebSocket. It checks what
the speech layer contract assumes about hand-offs, cuts, session fields and a second session for the
same call.

## Question

Does a delegation event carry the request's text, can nixie send one answer in several parts with
the last one closing it, which event reports a cut and how does it map to the characters of the
answer, which session fields turn delegation on and does `store: false` apply, and can the server
open a new session for the same call without a new offer from the device? And under the design's
hold, does GPT-Live speak a lead-in sentence part and wait for the next part, and does it stay quiet
through a hold of up to 30 s with a holding line?

## Answer

- `session.delegation.created` holds only an ID, a target and `offset_ms`. The request comes from
  the input transcript up to `offset_ms`.
- GPT-Live takes several `session.commentary.append` parts on one delegation ID, and nothing closes
  a delegation. A lead-in part and an empty part each made GPT-Live invent facts in 3 of 3 sessions,
  and an acknowledged part can go unspoken.
- Under the acknowledgement delay and an empty thinking part, a lead-in sentence part is safe only
  when the next part arrives while GPT-Live still speaks it. With parts 3 s apart, GPT-Live invented
  facts after "You have two new messages." and the like in 4 of 8 trials.
- Under the same hold, a holding line at 1.5 s and the whole answer at 5, 15 or 30 s worked in 18 of
  18 trials: GPT-Live spoke the line, stayed silent until the answer and invented no fact. It added
  a word to the line in 2 trials, and added no promise.
- No event reports a cut. In 6 of 6 trials, output stopped where your speech started on the session
  timeline, and word alignment maps the paraphrase onto the sent text.
- `delegation: { type: 'client' }` and `store: false` apply, and `client.data_channel` keeps the
  device from sending commands.
- Every new session needs a new offer. An ICE-restart offer from the device's open peer connection
  moved the call's audio to a new session, and the old one closed itself, but the data channel went
  quiet.

The speech layer contract needs 13 changes, listed in
[the results](results.md#contract-lines-that-must-change).

## Run it

Run from this directory, with the OpenAI key read straight into the command.

```bash
OPENAI_API_KEY=$(op read 'op://nixie/voice-openai/credential') bun run-probe.ts delegation --model gpt-live-1
bun print-timeline.ts results/<label>.jsonl
bun report-cuts.ts results/cut-<label>.jsonl
OPENAI_API_KEY=$(op read 'op://nixie/voice-openai/credential') bun run-probe.ts parts --trials 8
bun report-parts.ts results/parts-*.jsonl
OPENAI_API_KEY=$(op read 'op://nixie/voice-openai/credential') bun run-probe.ts holds --hold 15000 --trials 6
bun report-holds.ts results/holds-gpt-*.jsonl
```

The `holds` probe refuses a trial once the sessions it has logged under `results/` would pass 40
minutes, about $2. The [setup](results.md#setup) gives the versions, the 6 probes and the cost.

## Results

The [results](results.md) answer each question with the events seen, and list the contract lines
that must change.

## Untested

Real microphones and phone networks, the audio gap while a call moves to a new session, and captions
after the move. The [untested list](results.md#untested) gives the rest.
