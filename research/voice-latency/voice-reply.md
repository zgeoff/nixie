# What speaks a voice reply

This run compares four ways for nixie to speak a reply: two pipelines that put a Claude model
between local speech-to-text and Piper, and two speech-to-speech APIs, Grok Voice and GPT-Live. Each
candidate answered 13 caller lines for 3 rounds in an imp on the deployment host, and the two
speech-to-speech APIs also took 300 real utterances and 10 interruptions each. Grok Voice is the one
candidate that passes both gates: its first audio came 1.35 s after the end of speech at the median,
and no reply held a silence over 1 s. GPT-Live reached first audio at 1.41 s but went quiet for 1.7
to 3.8 s on 8 of the 9 requests it handed to Claude, so it fails the silence gate on the tool lines.

A listening pass ruled Piper's voice out, so the pipeline results measure Claude behind a voice
nixie will not ship. The same pass heard Grok Voice and GPT-Live as equal. From these results the
user chose GPT-Live, with Claude writing the answer to each request, under
[0040](../../docs/decisions/0040-voice-pipeline.md).

## Question

Which candidate should speak nixie's reply? The pass line is first audio at a median of 1.5 s or
less after the end of the caller's speech, and a silence inside the reply in fewer than 5% of turns.
Each candidate's full answer audio and its cost per minute sit beside the gates.

## Answer

- Grok Voice passes both gates, with tool calls answered in the same socket.
- GPT-Live passes the first-audio gate and fails the silence gate. Every long silence but one falls
  on a line it handed to Claude.
- Neither pipeline passes with Piper. Haiku 5.5 speaking clause by clause has no silences but
  reaches first audio at 2.51 s. Sonnet 5.5 behind an opener reaches first audio at 1.01 s, then
  goes quiet after the opener on 28% of turns.
- On real speech, each speech-to-speech API cuts the speaker off more on a different kind of speech,
  and both cut off more than the Jev detector in the [end-of-turn run](turn-end.md).
- On barge-in, Grok Voice goes quiet 0.85 s after the caller starts speaking at the median, and
  GPT-Live 1.47 s. Both then acknowledge the interruption.

Recommendation: Grok Voice, if Grok may phrase nixie's answers. It leads on speed, the user's first
priority, and it was the simpler API to build against. Choose GPT-Live instead if Claude must write
what nixie says on real requests: its client delegation hands each one to nixie's Claude turn, and
the cost is a wait of 1.7 to 3.8 s after its spoken filler, which 8 of the 9 delegated requests
held. Both load nixie's persona in the session instructions. A pipeline stays open only with a
streaming cloud voice in place of Piper, which this run did not test.

## Run it

Run from this directory. Every runner reads nixie's persona from `results/persona.md`, which stays
out of git, so copy the persona that the deployment runs with there first, or pass its path with
`--persona`. The pipeline runner and GPT-Live's delegated Claude turns reach Anthropic through a
broker. The Sonnet candidate's opener picker needs the Cloudflare account ID, and the broker adds
the Cloudflare key, so `--cloudflare-token` stays empty. The speech-to-speech runners read their API
key on stdin, so the key never reaches the command line or a file, and they connect to the vendor
directly, because the broker refuses WebSocket upgrades.

```bash
bun install
./models.sh
bun caller.ts
bun reply.ts --candidate haiku-clauses --out results/reply-haiku-clauses.jsonl
bun reply.ts --candidate sonnet-opener --out results/reply-sonnet-opener.jsonl \
  --cloudflare-account "$(op read 'op://nixie/voice-cloudflare/account-id')"
op read 'op://nixie/voice-xai/credential' | bun speech-to-speech.ts --candidate grok
op read 'op://nixie/voice-openai/credential' | bun speech-to-speech.ts --candidate gpt-live
bun report-reply.ts results/reply-*.jsonl
op read 'op://nixie/voice-xai/credential' | bun turn-taking.ts --candidate grok --set ami
bun report-turn-taking.ts results/turn-taking-*.jsonl
op read 'op://nixie/voice-xai/credential' | bun barge-in.ts --candidate grok
bun report-barge-in.ts results/barge-in-*.jsonl
```

The turn-taking runner takes `--set` of `ami`, `hvb` or `slurp`, and `--peak` scales each utterance
to a fixed peak level first. It reads the speech sets that the [end-of-turn run](turn-end.md#run-it)
downloads, so run its download steps first. `build-listening-set.ts` copies one round of recordings
into a blind set, with each candidate behind a letter and the answer key in a file of its own.

## Setup

| Candidate               | Hears the caller                                   | Writes the answer                                                           | Speaks it                   |
| ----------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------- |
| Haiku, clause by clause | Local Zipformer, after a 500 ms pause              | Haiku 5.5 at low effort, opening with its own acknowledgement               | Piper, one clause at a time |
| Sonnet with an opener   | Local Zipformer, after a 500 ms pause              | Sonnet 5.5 at low effort, while Clef-flash picks an opener from a fixed set | Piper, the opener first     |
| GPT-Live                | GPT-Live, which detects the end of the turn itself | GPT-Live for small talk; Sonnet 5.5 for each request it delegates           | GPT-Live, voice `marin`     |
| Grok Voice              | Grok Voice 3.0, with its server voice detection    | Grok Voice, with the stub tools as function tools                           | Grok Voice, voice `eve`     |

Haiku also ran with thinking off, as `haiku-clauses-thinking-off`. Every candidate takes nixie's
persona and the same spoken-reply rules. Ten caller lines draw a short spoken answer, and three need
one of three stub tools: the weather, the calendar and a timer. Piper's `ryan` voice speaks every
caller line, so the 13 lines are synthetic speech. Each round opens a fresh session, and each
speech-to-speech turn opens a fresh call.

First audio is the first sample at or above a fixed level on the playback timeline, measured from
the end of the caller's speech. A client plays the audio back to back as it arrives. The silence
gate counts the replies that hold a stretch over 1 s below that level between their first and last
sound, read from each turn's recording, so it measures all four candidates alike.

## Reply

| Candidate               | First audio, median / p90 | Full answer audio, median / p90 | Replies with a silence over 1 s | Tool called when needed | Cost per minute | Passes |
| ----------------------- | ------------------------- | ------------------------------- | ------------------------------- | ----------------------- | --------------- | ------ |
| Haiku, clause by clause | 2.51 / 4.81 s             | 3.23 / 5.47 s                   | 0%                              | 9 of 9                  | $0.0006         | no     |
| Haiku, thinking off     | 2.42 / 4.05 s             | 3.47 / 4.89 s                   | 0%                              | 9 of 9                  | $0.0006         | no     |
| Sonnet with an opener   | 1.01 / 1.28 s             | 3.58 / 4.87 s                   | 28.2%                           | 9 of 9                  | $0.0073         | no     |
| GPT-Live                | 1.41 / 1.73 s             | 12.50 / 15.99 s, not comparable | 23.1%                           | 9 of 9                  | $0.065          | no     |
| Grok Voice              | 1.35 / 1.88 s             | 3.44 / 4.09 s                   | 0%                              | 9 of 9                  | $0.033          | yes    |

Full answer audio is the time the last chunk of reply audio was ready. Grok Voice sends audio faster
than real time, so its figure is readiness, as the pipelines' is. GPT-Live paces its stream in real
time, so its last chunk arrives as the reply finishes playing, and its figure measures how long the
reply runs, not when the answer was ready.

The report also counts a gap: a chunk not ready when the one before it ends. For a pipeline, a gap
is a clause Piper has not finished, and Sonnet's opener left one on 74% of turns. GPT-Live's gaps,
on 15% of turns, ran 167 to 270 ms, which a client's jitter buffer absorbs. The silence column is
the gate for that reason.

The pipeline costs are what the Agent SDK reports per turn. The speech-to-speech costs are each
vendor's price per minute over the time the call was open, plus the Claude turns that GPT-Live
delegated.

### Tool lines

Grok Voice called each stub tool as a function call and spoke the answer with no long silence.
GPT-Live answered all ten plain lines itself and delegated each tool line to Sonnet 5.5, which
called the stub tool. GPT-Live then spoke a filler such as "Sure, one moment" and waited for
Sonnet's answer. 8 of the 9 delegated requests held a wait over 1 s, and those waits are 8 of its 9
long silences. It spoke Sonnet's answer close to word for word, and once added a date that Sonnet's
answer did not hold.

## Turn-taking on real speech

Each speech-to-speech API took the 100 first utterances of each set from the
[end-of-turn run](turn-end.md), streamed in real time. A cut-off is a reply whose first sound came
before the utterance's last speech ended. The wait runs from the last speech to the reply's first
sound, so it holds the time the model takes to answer as well as its end-of-turn decision, and it
does not compare with the end-of-turn run's waits.

| Speech               | GPT-Live cut off | Grok Voice cut off | GPT-Live wait, median / p90 | Grok Voice wait, median / p90 |
| -------------------- | ---------------- | ------------------ | --------------------------- | ----------------------------- |
| AMI, at a fixed peak | 28.0%            | 21.0%              | 1284 / 1959 ms              | 1324 / 3746 ms                |
| Harper Valley Bank   | 9.0%             | 1.0%               | 1498 / 2172 ms              | 1420 / 3691 ms                |
| SLURP                | 2.0%             | 13.0%              | 1093 / 1795 ms              | 1053 / 3652 ms                |

At its recorded level, Grok Voice never answered 49 of the 100 AMI utterances, which ran at about
half the level of the 51 it answered. With every utterance scaled to the same peak, as a client's
gain control would raise a quiet microphone, it answered all 100. GPT-Live answered all 100 at
either level and cut off 26% at the recorded one.

Grok Voice waits less at the median and has a long tail: its 90th percentile sits near 3.7 s on
every set. On the same speech, Jev cut off 7.5%, 2.5% and 0% at its agreed settings.

## Barge-in

Each run asked a line that draws a long answer, then streamed "Hang on, stop there." 2 s into the
reply. Grok Voice sends `input_audio_buffer.speech_started` when it hears the caller, and the client
drops the audio it holds but has not played, as nixie's client would. GPT-Live has no such signal
and stops its own stream.

|                                                                | Grok Voice   | GPT-Live       |
| -------------------------------------------------------------- | ------------ | -------------- |
| Reply went on after the interruption started, median / longest | 846 / 951 ms | 1465 / 1955 ms |
| Never stopped                                                  | 0 of 10      | 0 of 10        |
| Spoke again after stopping                                     | 10 of 10     | 10 of 10       |

The interruption itself takes about 1 s to say, so Grok Voice stops before the caller finishes and
GPT-Live about half a second after. Grok Voice then says a line such as "Paused. What's up?", and
GPT-Live "Okay, pausing."

## Building against each API

|                  | Grok Voice                                              | GPT-Live                                                                                                                           |
| ---------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Protocol         | The OpenAI Realtime event shape                         | Its own: one full-duplex stream for the session                                                                                    |
| End of a reply   | One `response.done` event                               | No event; the runner waits for 2.5 s without sound                                                                                 |
| Audio delivery   | Faster than real time                                   | Real time, with silence streamed between replies                                                                                   |
| Tools            | Function calls answered in the same socket              | Client delegation to nixie, answered with `session.commentary.append`                                                              |
| Stopping a reply | The client drops its buffered audio on `speech_started` | The API stops its own stream; the client has no cancel event                                                                       |
| Data retention   | 30 days by default; zero retention on enterprise plans  | 30 days for abuse monitoring; zero retention with OpenAI's prior approval, which turns off recording downloads and session forking |

## Listening

One round of each of the four candidates went into a listening set, as 13 lines in each voice. The
user heard Grok Voice and GPT-Live as equal and ruled Piper out as nixie's voice. The candidates'
letters were known when they listened, so the result is a labelled judgement, not a blind ranking.
With the two speech-to-speech voices heard as equal, the user chose between them on the measured
numbers, and no blind ranking ran.

## Untested

- Real microphone audio, and the audio path to a device.
- A pipeline with a streaming cloud voice in place of Piper.
- Grok Voice handing a request to Claude through a function tool, which would add the same wait as
  GPT-Live's delegation.
- How closely GPT-Live keeps Claude's wording over more than three tool lines.
- The speech-to-speech reply runs on real speech: the 13 caller lines are synthetic, and only the
  turn-taking test used real speakers.
