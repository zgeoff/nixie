# Voice latency on the deployment host

This run repeats the [voice-latency spike](README.md) on the host nixie deploys to, so the 2.5 s
gate in [0040](../../docs/decisions/0040-voice-pipeline.md) rests on that host's network path to the
model. The full answer here means the full answer's audio ready to play, not its text. With
`zipformer` and `piper`, the full answer's audio was ready 2.85 s after the end of speech at the
median, so the pipeline misses the gate and 0040's replacement rule triggers. The first audio came
at 1.93 s, and the full text at 2.29 s.

The model's time from its request to its first event took 1.17 s at the median, as on the test VM,
so the slow model share comes from the model path and not from the test VM's host. A 300 ms pause
misses the gate too, at 2.55 s, and on real conversational speech it cuts off 29 more utterances in
200 than a 500 ms pause does.

## Question

Does the voice pipeline meet the 2.5 s median from the end of speech to the full answer's audio on
the host nixie deploys to? What are the median and the 90th percentile to the first audio and to the
full answer's audio there? Does a 300 ms end-of-turn pause cut a caller off mid-sentence on real
speech?

## Host and model path

| Component        | Version                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| Host             | an imp on the deployment host, with 2 AMD EPYC vCPUs and 2 GiB of memory |
| Claude Agent SDK | 0.3.300, with Claude Code 2.1.300                                       |
| sherpa-onnx      | `sherpa-onnx-node` 1.13.8                                               |
| Bun              | 1.4.3                                                                   |
| Model            | `claude-haiku-5-5` at `effort: 'low'`                                   |

Every number comes from scripts that ran inside an imp on the deployment host, so the model requests
took the deployed network path. The model calls ran through the Agent SDK on the subscription
credential that imp's broker adds to each request, the path nixie takes in production, with no API
key. The first-token spike called the model on an API key, so its 0.60 s does not compare one to one
with the times here.

## Method

The scripts, the persona, the caller lines and the settings are the spike's, and the
[spike's setup](README.md#setup) describes them. The run had 3 parts:

1. Stage timings: `stages.ts` for `zipformer` at a 500 ms and a 300 ms pause, `moonshine`, and
   `piper`, 3 rounds each.
2. Calls end to end: 6 calls of `zipformer` and `piper` with 3 barge-ins each, alternating barge-ins
   at the first audio and 1.5 s after it, interleaved with 3 control calls, 2 `moonshine` calls and
   2 calls of `zipformer` and `piper` at a 300 ms pause.
3. Paired calls: 3 calls at a 500 ms pause alternating with 3 calls at a 300 ms pause, all with
   `--warm-long`, which speaks one long sentence before the first turn.

The run left out `whisper` and both Kokoro voices, which the spike ruled out on speed on the
same CPU class. The 306 timed turns cost $0.0275 by the SDK's own count, and every turn's result had
the subtype `success` with the `is_error` flag unset.

The pause test, [`pauses.ts`](pauses.ts), plays whole utterances through Silero at each pause
setting, offline, and counts an utterance as cut off when the detector closes a segment before its
last speech. [`real-speech.ts`](real-speech.ts) fetches 200 utterances of 8 or more words, 14 at the
median, from the test split of the AMI meeting corpus: 16 speakers in 16 meetings, recorded on
headset microphones, under CC BY 4.0. The test also ran on the spike's 10 synthetic caller lines.

## Results

Each cell holds the median and the 90th percentile, in ms.

### Speech-to-text on its own

| Model       | Pause  | End of speech to detection | Detection to transcript | Word errors |
| ----------- | ------ | -------------------------- | ----------------------- | ----------- |
| `zipformer` | 500 ms | 513 / 576                  | 39 / 49                 | 7.5%        |
| `zipformer` | 300 ms | 321 / 384                  | 38 / 52                 | 9.3%        |
| `moonshine` | 500 ms | 513 / 576                  | 225 / 285               | 0.0%        |

### Text-to-speech on its own

| Voice   | Acknowledgement | Answer sentence | Real-time factor |
| ------- | --------------- | --------------- | ---------------- |
| `piper` | 66 / 90         | 269 / 333       | 0.07 / 0.08      |

The speech stages run at the test VM's speed: each median sits within 6 ms of the spike's.

### End to end

Each time counts from the end of speech. The full answer's audio is ready when the last sentence is
synthesized.

| Recognizer, voice and pause   | Turns | Prompt sent | First text  | First audio | Full text   | Full audio  |
| ----------------------------- | ----- | ----------- | ----------- | ----------- | ----------- | ----------- |
| `zipformer`, `piper`, 500 ms  | 150   | 574 / 628   | 1781 / 2182 | 1933 / 2414 | 2289 / 2684 | 2854 / 3524 |
| `zipformer`, `piper`, 300 ms  | 50    | 366 / 421   | 1523 / 1944 | 1638 / 2317 | 2039 / 2545 | 2551 / 3648 |
| `moonshine`, `piper`, 500 ms  | 40    | 750 / 815   | 2008 / 2212 | 2116 / 2397 | 2546 / 2777 | 3185 / 3770 |
| Control, no speech            | 30    | 0 / 0       | 1059 / 1355 | -           | 1658 / 1834 | -           |

The 500 ms row pools the 120 turns of part 2 with the 30 of part 3. Of the 9 calls at a 500 ms
pause, 2 met the gate at their own median, at 2.48 s and 2.49 s, and the other 7 ran from 2.69 s to
3.15 s. The acknowledgement held 2 to 4 words in 98 of the 120 turns of part 2. For `zipformer` and
`piper` at a 500 ms pause, part 2's median turn spends its time as follows:

| Step                                        | Median |
| ------------------------------------------- | ------ |
| End of speech to detection                  | 544    |
| Detection to transcript                     | 44     |
| Prompt to the model request, inside the SDK | 31     |
| Model request to the first streamed event   | 1218   |
| First text to the acknowledgement's audio   | 101    |
| Full text to the full answer's audio        | 613    |

The model's share is 1.17 s at the median over all 150 turns and 1.57 s at the 90th percentile. The
test VM measured 1.11 s, so the deployment host gives the model no faster path. The control turns
took 1.06 s for the same step, and this run cannot tell whether the 0.11 s between them comes from
the speech models' load on 2 vCPUs or from chance over 30 turns.

The pipeline's own time after the full text, 0.61 s at the median, is larger than the 0.35 s by
which the full audio misses the gate. Most of it is the synthesis queue: the answer's sentences
arrive close together at the end of the turn, and one queue speaks them in turn.

### Piper stalls on some long sentences

In 12 of 150 turns, a sentence was not ready when the one before it finished playing, and the caller
heard a pause of 404 ms at the median. Across all 240 spoken turns, Piper synthesized 352 sentences
that play for 4 s or more, at a real-time factor of 0.07 at the median. Nine of them ran at 0.20 to
1.01 and took 1.5 to 14.3 s, and the worst added 14 s to its turn. The stall moves the 90th
percentile more than the median.

The stall reproduces in a Piper process with no model and no other load. There, the same sentence
ran at 0.40 or 0.76 when its length changed from the sentence before and the process grew, with no
major page faults, no CPU steal and 800 MB of memory free. The spike's
`--warm-long` flag speaks a long sentence first, and it did not remove the stall. The cause lies
inside Piper's ONNX runtime, and this run did not pin it down.

### Barge-in

| Barge-in starts             | Trials | Speech to detection | Model still writing | Interrupt to result |
| --------------------------- | ------ | ------------------- | ------------------- | ------------------- |
| 1.5 s after the first audio | 9      | 320 / 321           | 0                   | -                   |
| At the first audio          | 9      | 320 / 321           | 7                   | 19 / 38             |

Every turn after a barge-in ended with the subtype `success`, with a reply such as "Sure, I'll stop
there. What would you like to do next?"

### A shorter pause on real speech

| Pause  | AMI utterances cut off | Cut off at this pause, whole at 700 ms | Synthetic lines cut off |
| ------ | ---------------------- | -------------------------------------- | ----------------------- |
| 300 ms | 90 of 200 (45.0%)      | 51                                     | 0 of 10                 |
| 400 ms | 77 of 200 (38.5%)      | 38                                     | -                       |
| 500 ms | 61 of 200 (30.5%)      | 22                                     | 0 of 10                 |
| 700 ms | 39 of 200 (19.5%)      | 0                                      | -                       |

Every utterance that a 500 ms pause cuts off, a 300 ms pause cuts off too, and the 300 ms pause cuts
off 29 more. The pauses that end the turn early sit at hesitations and restarts, as in "each word in
the um … in the index" and "topic labelling with uh … key words". At the median, the detector ended
the turn after 30% of the utterance. The synthetic caller never pauses mid-sentence, so the
end-to-end runs above never show a cut-off. AMI is speech between people in a meeting, so a caller
talking to nixie may hesitate less, and the run did not measure speech of that kind.

## Findings

- The pipeline misses the 2.5 s median to the full answer's audio on the deployment host, at 2.85 s
  with `zipformer`, `piper` and a 500 ms pause. 0040's replacement rule triggers on these numbers.
  The first audio meets the gate at 1.93 s, with a 90th percentile of 2.41 s, and the full answer's
  audio has a 90th percentile of 3.52 s.
- The model's share, 1.17 s from request to first event, matches the test VM. The deployed network
  path does not close the gap to the first-token spike's 0.60 s, which ran on an API key.
- A 300 ms pause saves 208 ms and still misses the gate, at 2.55 s. On real conversational speech it
  cuts off 45% of utterances against 30.5% at 500 ms, so its saving costs more than it gains.
- A 500 ms pause cuts off 30.5% of the real utterances, and a 700 ms pause 19.5%. An end of turn from
  voice activity detection alone ends a fifth or more of real turns early at every pause tested.
- The pipeline spends 0.61 s after the full text on synthesis, more than the gate's 0.35 s miss, and
  Piper stalls on some long sentences for up to 14 s.

## Recommendation

The rule in 0040 triggers, and the owner decides whether to apply it now. Hold the swap to
speech-to-speech until the pipeline's own synthesis tail is cut and measured. The miss is 0.35 s,
the pipeline's synthesis after the full text takes 0.61 s, and the first audio meets the
gate by 0.57 s. Synthesizing at each clause, with the next clause synthesized while one plays, bounds
the sentence length that triggers the Piper stall and moves most of the tail before the full text.
If the full answer's audio still misses with that change, apply the swap. A speech-to-speech model
replaces nixie's turn as well as the speech stages, which costs the one runtime, one persona and one
route that 0040 keeps.

Keep the 500 ms pause. Whichever path voice takes, the end of turn needs more than a pause: the real
speech here shows that a detector alone cuts off nearly a third of utterances at 500 ms.

## What this run leaves untested

- Clause-level synthesis, and a synthesis queue that runs ahead of playback.
- An end of turn that reads the transcript, or resumes a turn the caller continues.
- Speech from a caller talking to an assistant, with real microphones and noise.
- The cause of the Piper stall inside the ONNX runtime.
