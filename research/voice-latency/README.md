# Spike: end-to-end voice latency

This spike times nixie's voice pipeline from the end of the caller's speech to the first audio of
the reply and to the full answer, against the 2.5 s median gate in decision
[0040](../../docs/decisions/0040-voice-pipeline.md). The pipeline runs voice activity detection,
speech-to-text and text-to-speech on the host, around Haiku 5.5 on one live `stream` process.

## Question

How long does a spoken turn take from the end of the caller's speech to the first audio and to the
full answer, how long does each speech stage take on its own, so a miss points at the stage to
change, and does barge-in with voice activity detection cut a reply off fast enough?

## Answer

- With `zipformer` and `piper`, the first audio came 1.88 s after the end of speech at the median,
  inside the gate, and the full answer's audio was ready at 2.86 s, outside it.
- The speech stages took 0.56 s before the turn and 0.09 s for the opening phrase, against the 1.3
  to 1.5 s that 0040 assumed.
- The model's time to its first event took 1.11 s at the median, the largest step, and nearly twice
  what the [first-token spike](../sdk-first-token/README.md) measured on another host.
- On the deployment host, the full answer's audio was ready at 2.85 s, so the pipeline misses the
  gate on the deployed path too.
- Barge-in stops playback 288 ms after the caller starts speaking.

Keep the pipeline with `zipformer`, `piper` and Silero, and cut the 0.60 s synthesis tail after the
full text.

## Run it

Run from this directory, with an Anthropic credential read straight into the command.

```bash
bun install
./models.sh
bun caller.ts
bun stages.ts --out results/stages.jsonl --stt zipformer --rounds 3
bun stages.ts --out results/stages.jsonl --tts piper --rounds 3
bun bench.ts --out results/calls.jsonl --stt zipformer --tts piper --rounds 2 --barge-ins 3
bun report.ts results/stages.jsonl results/calls.jsonl
```

The [setup](results.md#setup) gives the versions, the candidates, the stage and pause tests, and the
flags.

## Results

The [results](results.md) hold the tables for this run, and the
[run on the deployment host](deployment-host.md) repeats it on the host nixie deploys to. The
[end-of-turn run](turn-end.md) compares silence, Smart Turn, Clef-flash and Jev on 600 real
utterances: none cuts off fewer than 5% of meeting speech at a 1.2 s maximum wait, and Jev passes on
task calls and commands, between Clef-flash's fewer cut-offs and the averaged pair's shorter waits.
The [reply run](voice-reply.md) compares two Claude pipelines with Grok Voice and GPT-Live: Grok
Voice alone passes the first-audio and silence gates, and GPT-Live is the one that hands real
requests to Claude. Its blind ranking is the user's to make, and the user records it on the spike's
issue.

## Untested

Real microphone audio and the audio path to a device. The [untested list](results.md#untested) gives
the rest, and the [reply run's list](voice-reply.md#untested) gives what it left open.
