# Spike results: end-to-end voice latency

This spike times nixie's voice pipeline from the end of the caller's speech to the first audio of
the reply and to the full answer. The pipeline is the one from
[0040](../../docs/decisions/0040-voice-pipeline.md): voice activity detection, speech-to-text on the
host, Haiku 5.5 on one live `stream` process, and text-to-speech on the host, one sentence at a
time. With the best pair of speech models, the first audio came 1.88 s after the end of speech at
the median, and the full answer's audio was ready at 2.86 s. The pipeline meets the 2.5 s median to
the first audio, and misses it to the full answer.

The speech stages are not the cause: they took 0.56 s before the turn started and 0.09 s for the
opening phrase. The model's own time to its first token took 1.11 s at the median on this host,
nearly twice what the [first-token spike](../sdk-first-token/README.md) measured on another host.

The [run on the deployment host](deployment-host.md) repeats the spike on the host nixie deploys to.
There the full answer's audio was ready at 2.85 s at the median and the model's share took 1.17 s,
so the pipeline misses the gate on the deployed path too. That run adds a test of a shorter pause on
real speech.

## Question

How long does a spoken turn take from the end of the caller's speech to the first audio and to the
full answer, against the 2.5 s median gate in 0040? How long do the speech-to-text and
text-to-speech stages take on their own, so a miss points at the stage to change? Does barge-in with
voice activity detection cut a reply off fast enough? The first-token spike timed only the turn, and
assumed 1.3 to 1.5 s for the speech stages.

## Setup

| Component        | Version                                                            |
| ---------------- | ------------------------------------------------------------------ |
| Claude Agent SDK | 0.3.300, with Claude Code 2.1.300                                  |
| sherpa-onnx      | `sherpa-onnx-node` 1.13.8                                          |
| Bun              | 1.4.2                                                              |
| Host             | a virtual machine with 2 AMD EPYC vCPUs and 2 GB of memory, no GPU |
| Model            | `claude-haiku-5-5` at `effort: 'low'`                              |

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
recognizer in real time, 32 ms at a time, as a microphone would. The clock starts at the moment the
window that holds the last speech sample arrives on that schedule, so a slow decode counts toward
the latency. The detector ends the turn after a 500 ms pause.

[`stages.ts`](stages.ts) times each speech stage alone, with no model turn beside it. It plays the
10 lines to each recognizer 3 times and counts word errors against the line's text, and it speaks 6
reply sentences 3 times with each voice.

[`bench.ts`](bench.ts) runs a call end to end for one recognizer and one voice. It opens one
`query()` with a prompt stream and the persona as the whole system prompt, with `tools: []` and
`settingSources: []` as in the first-token spike. The persona asks each reply to open with an
acknowledgement of 2 to 4 words that never claims an outcome or makes a promise, then to answer in 2
or 3 spoken sentences. An untimed first turn starts the process, because its start-up is per call,
not per turn. Each later turn hears a line, sends the transcript, splits the streamed text at each
sentence end, and speaks each sentence in order on one synthesis queue.

A row holds the time to each milestone from the end of speech, the turn's cost, and its result's
subtype and `is_error` flag. A failed API request ends the turn with the subtype `success` and the
flag set, so the report counts a turn as failed when either shows an error. A failed turn produces
no reply to time, so the report leaves it out of the timing tables.

The barge-in trials ask for the long reply. Once its first sentence is ready to play, the caller's
barge-in line starts, either at once or 1.5 s later. A second detector listens for its onset, and
the bench stops the speech queue when the detector reports speech. If the model is still writing,
the bench calls `interrupt()` on the query. The barge-in line then goes to the model as the next
turn.

`--control` sends the line's text with no speech stages running, so a control turn times the model
alone on the same host and in the same window.

### Run it

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
starts. `--warm-long` speaks one long sentence before the first turn. `bun test` checks how the
report counts a failed turn, and how the pause test classifies a recorded sentence from the models
that `models.sh` downloads. Git ignores `models/` and `results/`.

The pause test fetches real utterances from the AMI meeting corpus and plays them through the
detector at each pause:

```bash
bun real-speech.ts
bun pauses.ts --out results/pauses-real.jsonl --set real --pauses 300,400,500,700
bun pauses.ts --out results/pauses-caller.jsonl --set caller --pauses 300,500
```

## Results

The run had 3 parts. The first ran 4 pairs of recognizer and voice for 20 turns each, with barge-ins
1.5 s into the reply. The second alternated the 2 fastest pairs over 5 calls each, 100 turns, with
barge-ins at the first audio. The third alternated 3 calls of control turns with 3 calls of
`zipformer` and `piper`. Every turn's result had the subtype `success`. The run did not record the
`is_error` flag, so its rows cannot rule out a failed API request. All 100 `zipformer` and `piper`
turns had both audio times, so no failed turn entered that pair's figures; for the other pairs, the
spike kept no count of turns without audio. The 304 turns cost $0.023 by the SDK's own count. Each
cell holds the median and the 90th percentile, in ms.

### Speech-to-text on its own

| Model       | Pause  | End of speech to detection | Detection to transcript | Word errors |
| ----------- | ------ | -------------------------- | ----------------------- | ----------- |
| `zipformer` | 500 ms | 513 / 586                  | 45 / 65                 | 9.3%        |
| `zipformer` | 300 ms | 321 / 417                  | 38 / 57                 | 11.2%       |
| `moonshine` | 500 ms | 513 / 577                  | 219 / 281               | 2.8%        |
| `whisper`   | 500 ms | 512 / 600                  | 585 / 785               | 0.0%        |

The detector ends the turn 12 to 21 ms after the pause at the median, so the pause setting is most
of the stage. Zipformer leaves 45 ms of work at the end because it decodes while the caller speaks.
Most of its word errors split a compound in two, such as "window sill". One split changed the
meaning: "weekend" became "week end", and some replies planned for a week of camping. Zipformer
returns lowercase text with no punctuation.

### Text-to-speech on its own

| Voice         | Acknowledgement | Answer sentence | Real-time factor |
| ------------- | --------------- | --------------- | ---------------- |
| `piper`       | 71 / 95         | 270 / 364       | 0.07 / 0.10      |
| `kokoro`      | 1206 / 1366     | 2731 / 2977     | 0.67 / 1.08      |
| `kokoro-int8` | 2677 / 2888     | 5499 / 6464     | 1.40 / 2.38      |

The real-time factor is the synthesis time over the audio's length, so a factor above 1 speaks
slower than it plays. Piper speaks a short acknowledgement in under 0.1 s. Kokoro needs about 1.2 s
for the same phrase on 2 vCPUs, and its int8 build is slower than full precision on this CPU. The
spike did not judge how either voice sounds.

### End to end

Each time counts from the end of speech. The full answer's audio is ready when the last sentence is
synthesized; the caller hears that sentence later, once the sentences before it have played.

| Recognizer and voice  | Turns | Prompt sent | First text  | First audio | Full text   | Full audio   |
| --------------------- | ----- | ----------- | ----------- | ----------- | ----------- | ------------ |
| `zipformer`, `piper`  | 100   | 560 / 647   | 1698 / 2540 | 1878 / 2675 | 2195 / 3030 | 2861 / 3648  |
| `moonshine`, `piper`  | 70    | 766 / 854   | 2133 / 3077 | 2293 / 3184 | 2631 / 3535 | 3370 / 4381  |
| `whisper`, `piper`    | 20    | 1194 / 1394 | 2579 / 3534 | 2716 / 3608 | 3277 / 3878 | 3983 / 4837  |
| `moonshine`, `kokoro` | 20    | 759 / 796   | 1804 / 2263 | 3163 / 4283 | 2021 / 2536 | 9794 / 11638 |
| Control, no speech    | 30    | 0 / 0       | 1144 / 1767 | -           | 1668 / 2075 | -            |

The first audio is the acknowledgement. It held 2 to 4 words in 184 of 210 spoken turns, and "Good
question." opened most replies. For `zipformer` and `piper`, the median turn spends its time as
follows:

| Step                                        | Median |
| ------------------------------------------- | ------ |
| End of speech to detection                  | 512    |
| Detection to transcript                     | 40     |
| Prompt to the model request, inside the SDK | 26     |
| Model request to the first streamed event   | 1105   |
| First text to the acknowledgement's audio   | 94     |
| Full text to the full answer's audio        | 595    |

The model's share decides the result. On this host, the time from the model request to the first
event took 1.11 s at the median and 1.92 s at the 90th percentile. The control turns, with no speech
stages running, took 1.14 s, so the speech models on the same 2 vCPUs do not slow the model. The
first-token spike measured 0.60 s for the same step on another host. The spike cannot tell how much
of the gap comes from the network path and how much from the model's load at the time of the run.
The model's share also moved between the parts of the run: `zipformer` and `piper` reached the full
audio at 2.45 s at the median in the first part, and at 2.86 s and 3.02 s in the other two.

The last 0.60 s comes from the synthesis queue. The answer's sentences arrive close together at the
end of the turn, and one queue speaks them in turn at about 0.27 s each. The caller never waits on
that tail while the earlier sentences still play. In 19 of 100 turns, a sentence was not ready when
the one before it finished playing, and the caller heard a pause of 191 ms at the median and 590 ms
at the 90th percentile. Those pauses came after the acknowledgement, while the model was still
writing the first sentence of the answer.

### Barge-in

| Barge-in starts             | Trials | Speech to detection | Model still writing | Interrupt to result |
| --------------------------- | ------ | ------------------- | ------------------- | ------------------- |
| 1.5 s after the first audio | 12     | 288 / 288           | 0                   | -                   |
| At the first audio          | 20     | 288 / 288           | 19                  | 10 / 20             |

The detector reports the caller's speech 288 ms after it starts. That is the detector's 200 ms
minimum speech length plus its windows. Playback stops at that moment. When the model is still
writing, `interrupt()` ends the turn within 20 ms at the 90th percentile, and the next turn runs on
the same process. Every next turn's result had the subtype `success`, with a reply such as "Sure,
I'll stop there."

At 1.5 s into a long reply, the model had always finished writing. The caller heard 1.8 s of a reply
that runs 12 to 21 s, and the session still holds the whole reply as said.

## Findings

- The pipeline meets the 2.5 s median to the first audio, at 1.88 s with `zipformer` and `piper`. It
  misses the 2.5 s median to the full answer's audio, at 2.86 s. It meets it to the full answer's
  text, at 2.20 s. The full audio met the gate in one part of the run and missed it in the other
  two, so the verdict rests on the model's share at the time of the run.
- The speech stages take 0.56 s before the turn and 0.09 s before the first audio, against the 1.3
  to 1.5 s that 0040 assumed. The model's time to its first event, at 1.11 s on this host, is the
  largest step.
- `zipformer` is the fastest recognizer by 206 ms over `moonshine`, at a higher word error rate.
  `whisper` made no word errors and is the slowest.
- `piper` is the only voice tested that keeps ahead of playback on 2 vCPUs. Kokoro needs a faster
  host or a GPU before it can speak the first phrase in time.
- A 300 ms pause, instead of 500 ms, ends the turn 192 ms sooner at the median. On real speech, the
  [run on the deployment host](deployment-host.md#a-shorter-pause-on-real-speech) found that it cuts
  off 45% of utterances against 30.5% at 500 ms.
- Barge-in by voice activity detection stops playback 288 ms after the caller starts. The session
  then holds the full reply, though the caller heard only part of it.

## Recommendation

Keep the pipeline with `zipformer`, `piper` and Silero. The gate misses on the model's share, and
the [run on the deployment host](deployment-host.md#recommendation) gives the recommendation on the
swap to speech-to-speech from that host's numbers. 2 changes cut the pipeline's own time:

- Synthesizing the next sentence while one plays, or speaking at each clause, shortens the 0.60 s
  tail after the full text. This spike did not build either.
- A small acknowledgement model, the fallback in 0040, makes the first audio independent of the
  model's first token. The first audio meets the gate here, so the spike did not build it.

## Untested

- Real microphone audio, noise, accents and a speakerphone. Without echo cancellation, nixie's own
  playback reaches the detector and would trigger a barge-in.
- The audio path to and from a device. The times here end when the audio is ready on the host.
- A reply that calls a tool, which adds model rounds before the answer.
- How each voice sounds.
- Hosted speech services. The host candidates kept the speech on the host, as 0040 wants.
