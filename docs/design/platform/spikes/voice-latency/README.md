# Spike: end-to-end voice latency

This spike times nixie's voice pipeline from the end of the caller's speech to the first audio of
the reply and to the full answer. The pipeline is the one from
[0040](../../../../decisions/0040-voice-pipeline.md): voice activity detection, speech-to-text on
the host, Haiku 5.5 on one live `stream` process, and text-to-speech on the host, one sentence at a
time. With the best pair of speech models, the first audio came 2.03 s after the end of speech at
the median, and the full answer's audio was ready at 3.10 s. The pipeline meets the 2.5 s median to
the first audio, and misses it to the full answer. The speech stages are not the cause: they took
0.58 s before the turn started and 0.08 s for the opening phrase. The model's own time to its first
token took 1.30 s at the median on this host, about twice what the
[first-token spike](../sdk-first-token/README.md) measured on another host.

## Question

How long does a spoken turn take from the end of the caller's speech to the first audio and to the
full answer, against the 2.5 s median gate in 0040? How long do the speech-to-text and
text-to-speech stages take on their own, so a miss points at the stage to change? Does barge-in with
voice activity detection cut a reply off fast enough? The first-token spike timed only the turn, and
assumed 1.3 to 1.5 s for the speech stages.

## Versions

| Component        | Version                                                            |
| ---------------- | ------------------------------------------------------------------ |
| Claude Agent SDK | 0.3.300, with Claude Code 2.1.300                                  |
| sherpa-onnx      | `sherpa-onnx-node` 1.13.8                                          |
| Bun              | 1.4.2                                                              |
| Host             | a virtual machine with 2 AMD EPYC vCPUs and 2 GB of memory, no GPU |
| Model            | `claude-haiku-5-5` at `effort: 'low'`                              |

## Setup

Every speech model runs on the host through sherpa-onnx, on 2 threads. [`speech.ts`](speech.ts)
builds the candidates:

| Stage          | Candidate                                    | How it works                                      |
| -------------- | -------------------------------------------- | ------------------------------------------------- |
| Speech-to-text | `zipformer`, streaming Zipformer, int8       | Decodes while the caller speaks                   |
| Speech-to-text | `moonshine`, Moonshine base, int8            | Reads the whole utterance after the end of speech |
| Speech-to-text | `whisper`, Whisper base.en, int8             | Reads the whole utterance after the end of speech |
| Text-to-speech | `piper`, Piper `en_US-lessac-medium`         | VITS, one sentence per call                       |
| Text-to-speech | `kokoro` and `kokoro-int8`, Kokoro 82M v0.19 | Full precision and int8                           |
| Detection      | Silero VAD                                   | 32 ms windows, threshold 0.5                      |

The caller is synthetic. [`caller.ts`](caller.ts) speaks 10 invented questions, a barge-in line and
a line that draws a long reply with Piper's `ryan` voice, so the caller never shares a voice with
nixie. It trims the silence around the speech, so the end of speech is known to the sample, and adds
1.5 s of silence after it. [`listen.ts`](listen.ts) plays each line into the detector and the
recognizer in real time, 32 ms at a time, as a microphone would. The clock starts when the last
speech sample reaches them. The detector ends the turn after a 500 ms pause.

[`stages.ts`](stages.ts) times each speech stage alone, with no model turn beside it. It plays the
10 lines to each recognizer 3 times and counts word errors against the line's text, and it speaks 6
reply sentences 3 times with each voice.

[`bench.ts`](bench.ts) runs a call end to end for one recognizer and one voice. It opens one
`query()` with a prompt stream and the persona as the whole system prompt, with `tools: []` and
`settingSources: []` as in the first-token spike. The persona asks each reply to open with an
acknowledgement of 2 to 4 words that never claims an outcome or makes a promise, then to answer in 2
or 3 spoken sentences. An untimed first turn starts the process, because its start-up is per call,
not per turn. Each later turn hears a line, sends the transcript, splits the streamed text at each
sentence end, and speaks each sentence in order on one synthesis queue. A row holds the time to each
milestone from the end of speech, and the turn's cost.

The barge-in trials ask for the long reply. Once its first sentence is ready to play, the caller's
barge-in line starts, either at once or 1.5 s later. A second detector listens for its onset, and
the bench stops the speech queue when the detector reports speech. If the model is still writing,
the bench calls `interrupt()` on the query. The barge-in line then goes to the model as the next
turn.

`--control` sends the line's text with no speech stages running, so a control turn times the model
alone on the same host and in the same window.

## Run it

Run each command from this directory. The runs need about 1.7 GB of models and an Anthropic
credential in `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`, read straight into the command.

```bash
bun install
./models.sh
bun caller.ts
bun stages.ts --out results/stages.jsonl --stt zipformer --rounds 3
bun stages.ts --out results/stages.jsonl --tts piper --rounds 3
bun bench.ts --out results/calls.jsonl --stt zipformer --tts piper --rounds 2 --barge-ins 3
bun report.ts results/stages.jsonl results/calls.jsonl
```

`--silence-ms` sets the pause that ends a turn, and `--barge-in-after-ms` sets when the barge-in
starts. Git ignores `models/` and `results/`.

## Results

The run had 3 parts. The first ran 4 pairs of recognizer and voice for 20 turns each, with barge-ins
1.5 s into the reply. The second alternated the 2 fastest pairs over 5 calls each, 100 turns, with
barge-ins at the first audio. The third alternated 3 calls of control turns with 3 calls of
`zipformer` and `piper`. Every turn ended in `success`. The 304 turns cost $0.024 by the SDK's own
count. Each cell holds the median and the 90th percentile, in ms.

### Speech-to-text on its own

| Model       | Pause  | End of speech to detection | Detection to transcript | Word errors |
| ----------- | ------ | -------------------------- | ----------------------- | ----------- |
| `zipformer` | 500 ms | 525 / 610                  | 50 / 77                 | 7.5%        |
| `zipformer` | 300 ms | 321 / 395                  | 49 / 79                 | 8.4%        |
| `moonshine` | 500 ms | 513 / 577                  | 235 / 277               | 1.9%        |
| `whisper`   | 500 ms | 515 / 576                  | 577 / 764               | 2.8%        |

The detector ends the turn 13 to 25 ms after the pause at the median, so the pause setting is most
of the stage. Zipformer leaves 50 ms of work at the end because it decodes while the caller speaks.
Most of its word errors split a compound in two, such as "window sill". One split changed the
meaning: "weekend" became "week end", and Haiku 5.5 answered for a week of camping. Zipformer
returns lowercase text with no punctuation.

### Text-to-speech on its own

| Voice         | Acknowledgement | Answer sentence | Real-time factor |
| ------------- | --------------- | --------------- | ---------------- |
| `piper`       | 79 / 92         | 266 / 329       | 0.07 / 0.08      |
| `kokoro`      | 1283 / 1348     | 2640 / 3003     | 0.66 / 1.10      |
| `kokoro-int8` | 2736 / 2891     | 5445 / 6331     | 1.39 / 2.40      |

The real-time factor is the synthesis time over the audio's length, so a factor above 1 speaks
slower than it plays. Piper speaks a short acknowledgement in under 0.1 s. Kokoro needs more than
1.2 s for the same phrase on 2 vCPUs, and its int8 build is slower than full precision on this CPU.
The spike did not judge how either voice sounds.

### End to end

Each time counts from the end of speech. The full answer's audio is ready when the last sentence is
synthesized; the caller hears that sentence later, once the sentences before it have played.

| Recognizer and voice  | Turns | Prompt sent | First text  | First audio | Full text   | Full audio    |
| --------------------- | ----- | ----------- | ----------- | ----------- | ----------- | ------------- |
| `zipformer`, `piper`  | 100   | 576 / 628   | 1874 / 2836 | 2034 / 2971 | 2424 / 3273 | 3099 / 3948   |
| `moonshine`, `piper`  | 70    | 778 / 836   | 2013 / 2826 | 2261 / 2915 | 2583 / 3326 | 3275 / 4058   |
| `whisper`, `piper`    | 20    | 1168 / 1335 | 2059 / 2261 | 2177 / 2394 | 2361 / 3007 | 3055 / 3627   |
| `moonshine`, `kokoro` | 20    | 796 / 824   | 1825 / 2420 | 3270 / 4098 | 2372 / 2853 | 10044 / 11199 |
| Control, no speech    | 30    | 0 / 0       | 1287 / 2246 | -           | 1819 / 2883 | -             |

The first audio is the acknowledgement. It held 2 to 4 words in 187 of 210 spoken turns, and "Good
question." opened most replies. For `zipformer` and `piper`, the median turn spends its time as
follows:

| Step                                        | Median |
| ------------------------------------------- | ------ |
| End of speech to detection                  | 525    |
| Detection to transcript                     | 50     |
| Prompt to the model request, inside the SDK | 25     |
| Model request to the first streamed event   | 1301   |
| First text to the acknowledgement's audio   | 92     |
| Full text to the full answer's audio        | 634    |

The model's share decides the result. On this host, the time from the model request to the first
event took 1.30 s at the median and 2.22 s at the 90th percentile. The control turns, with no speech
stages running, took 1.28 s, so the speech models on the same 2 vCPUs do not slow the model. The
first-token spike measured 0.60 s for the same step on another host. The spike cannot tell how much
of the gap comes from the network path and how much from the model's load at the time of the run.
The model's share also moved between the parts of the run: in the first part, `zipformer` and
`piper` reached the full audio at 2.42 s at the median.

The last 0.63 s comes from the synthesis queue. The answer's sentences arrive close together at the
end of the turn, and one queue speaks them in turn at about 0.27 s each. The caller never waits on
that tail while the earlier sentences still play. In 17 of 100 turns, a sentence was not ready when
the one before it finished playing, and the caller heard a pause of 175 ms at the median and 1.19 s
at the 90th percentile. Those pauses came after the acknowledgement, while the model was still
writing the first sentence of the answer.

### Barge-in

| Barge-in starts             | Trials | Speech to detection | Model still writing | Interrupt to result |
| --------------------------- | ------ | ------------------- | ------------------- | ------------------- |
| 1.5 s after the first audio | 12     | 288 / 289           | 0                   | -                   |
| At the first audio          | 20     | 288 / 292           | 13                  | 12 / 25             |

The detector reports the caller's speech 288 ms after it starts. That is the detector's 200 ms
minimum speech length plus its windows. Playback stops at that moment. When the model is still
writing, `interrupt()` ends the turn within 25 ms at the 90th percentile, and the next turn runs on
the same process. Every next turn ended in `success`, with a reply such as "Sure, I'll stop there."

At 1.5 s into a long reply, the model had always finished writing. The caller heard 1.8 s of a reply
that runs 8 to 16 s, and the session still holds the whole reply as said.

## Findings

- The pipeline meets the 2.5 s median to the first audio, at 2.03 s with `zipformer` and `piper`. It
  misses the 2.5 s median to the full answer's audio, at 3.10 s. It meets it to the full answer's
  text, at 2.42 s, by a margin smaller than the drift of the model's share between parts of the run.
- The speech stages take 0.58 s before the turn and 0.09 s before the first audio, against the 1.3
  to 1.5 s that 0040 assumed. The model's time to its first event, at 1.30 s on this host, is the
  largest step.
- `zipformer` is the fastest recognizer by 200 ms over `moonshine`, at a higher word error rate that
  left the meaning intact on these lines. `whisper` is the slowest.
- `piper` is the only voice tested that keeps ahead of playback on 2 vCPUs. Kokoro needs a faster
  host or a GPU before it can speak the first phrase in time.
- A 300 ms pause, instead of 500 ms, ends the turn 204 ms sooner at the median. The spike did not
  test how often a shorter pause cuts a caller off mid-sentence.
- Barge-in by voice activity detection stops playback 288 ms after the caller starts. The session
  then holds the full reply, though the caller heard only part of it.

## Recommendation

Keep the pipeline with `zipformer`, `piper` and Silero, and hold the swap to speech-to-speech until
the run repeats on the host nixie deploys to. The gate misses on the model's share, which differs
between hosts and between runs, and a speech-to-speech model replaces the model as well as the
speech stages. If the full answer still misses there, 3 changes cut the pipeline's own time:

- A 300 ms pause saves 204 ms, measured in this spike.
- Synthesizing the next sentence while one plays, or speaking at each clause, shortens the 0.63 s
  tail after the full text. This spike did not build either.
- A small acknowledgement model, the fallback in 0040, makes the first audio independent of the
  model's first token. The first audio meets the gate here, so the spike did not build it.

## What this spike leaves untested

- Real microphone audio, noise, accents and a speakerphone. Without echo cancellation, nixie's own
  playback reaches the detector and would trigger a barge-in.
- The audio path to and from a device. The times here end when the audio is ready on the host.
- A reply that calls a tool, which adds model rounds before the answer.
- How each voice sounds, and how often a 300 ms pause cuts a caller off.
- Hosted speech services. The host candidates kept the speech on the host, as 0040 wants.
