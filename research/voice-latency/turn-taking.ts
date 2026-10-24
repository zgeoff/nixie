// Streams real utterances to a speech-to-speech candidate in real time and records when its reply
// first makes a sound, against when the utterance's last speech ended, so its cut-offs compare with
// the end-of-turn detectors' on the same speech. Each utterance writes one JSON line and a recording.
// Usage: echo <key> | turn-taking.ts --candidate <gpt-live|grok> --set <ami|hvb|slurp> [--limit 100]
//   [--peak <0..1>] [--out <file>] [--persona results/persona.md] [--replace]
// --peak scales each utterance to that peak level first, as a client's gain control would.
import { mkdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { buildRecording } from './build-recording.ts';
import { findSoundSpan } from './find-sound-span.ts';
import { planPlayback } from './plan-playback.ts';
import { reserveOutput } from './reserve-output.ts';
import { soundThreshold } from './sound-threshold.ts';
import { speechSetDir } from './speech-sets.ts';
import { speechUtterance } from './speech-utterance.ts';
import { createVad, sampleRate } from './speech.ts';
import { startGptLiveCall } from './start-gpt-live-call.ts';
import { startGrokCall } from './start-grok-call.ts';
import { toPeakLevel } from './to-peak-level.ts';
import { toWav } from './to-wav.ts';
import type { TurnTakingRecord } from './turn-taking-record.ts';
import type { VoiceCall } from './voice-call.ts';
import { toRecordingsDir } from './to-recordings-dir.ts';
import { waitForReady } from './wait-for-ready.ts';
import { acknowledgeRules } from './voice-rules.ts';

const { values } = parseArgs({
  options: {
    candidate: { type: 'string' },
    limit: { default: '100', type: 'string' },
    out: { type: 'string' },
    peak: { type: 'string' },
    persona: { default: 'results/persona.md', type: 'string' },
    replace: { default: false, type: 'boolean' },
    set: { type: 'string' },
  },
});
const peak = values.peak === undefined ? undefined : z.coerce.number().positive().max(1).parse(values.peak);
const candidate = z.enum(['gpt-live', 'grok']).parse(values.candidate);
const set = z.enum(['ami', 'hvb', 'slurp']).parse(values.set);
const limit = z.coerce.number().int().positive().parse(values.limit);
const runName = `${candidate}-${set}${peak === undefined ? '' : `-peak${peak}`}`;
const out = values.out ?? `results/turn-taking-${runName}.jsonl`;
const recordingsDir = toRecordingsDir(out);
const instructions = `${readFileSync(values.persona, 'utf8').trim()}\n\n${acknowledgeRules}`;
const key = (await new Response(Bun.stdin.stream()).text()).trim();
if (key === '') {
  console.error('pass the API key on stdin');
  process.exit(1);
}
// The end-of-turn spike's pause, so the last speech here is the one its cut-offs counted against.
const pauseMs = 200;
// The reply's first seconds show whether it cut the caller off, so the call ends this long after.
const heardMs = 3000;
// A candidate that has not spoken this long after the last speech counts as never replying.
const giveUpMs = 12_000;
const windowSamples = 512;
const windowMs = (windowSamples / sampleRate) * 1000;

mkdirSync(recordingsDir, { recursive: true });
const reservation = reserveOutput(out, values.replace);
if ('refused' in reservation) {
  console.error(
    match(reservation.refused)
      .with('exists', () => `${out} already holds a run; pass --replace to start it again`)
      .with('held', () => `another run holds ${out}; if none is running, remove ${out}.lock`)
      .exhaustive(),
  );
  process.exit(1);
}

const dir = speechSetDir(set);
const vad = createVad(pauseMs);
for (let index = 0; index < limit; index++) {
  const meta = speechUtterance.parse(await Bun.file(join(dir, `${index}.json`)).json());
  const raw = new Float32Array(await Bun.file(join(dir, `${index}.f32`)).arrayBuffer());
  const speech = peak === undefined ? raw : toPeakLevel(raw, peak);
  vad.reset();
  vad.accept(speech);
  vad.accept(new Float32Array(sampleRate));
  const lastSegment = vad.readSegments().at(-1);
  const lastSpeechSample = lastSegment?.end ?? speech.length;
  const lastSpeechMs = (lastSpeechSample / sampleRate) * 1000;
  const call: VoiceCall =
    candidate === 'grok'
      ? startGrokCall({ instructions, key, sampleRate, voice: 'eve' })
      : startGptLiveCall({
          instructions,
          key,
          quietMs: 2500,
          runDelegation: () => Promise.resolve('That lookup is not available right now.'),
          sampleRate,
          soundThreshold,
          voice: 'marin',
        });
  let error: string | undefined;
  call.ended.catch((reason: unknown) => {
    error = String(reason);
  });
  error ??= await waitForReady(call.ready, 10_000);
  const streamStartAt = performance.now();
  const silence = new Float32Array(windowSamples);
  let firstSoundAt: number | undefined;
  let checked = 0;
  for (let window = 0; error === undefined; window++) {
    const now = performance.now();
    if (firstSoundAt !== undefined && now - firstSoundAt > heardMs) {
      break;
    }
    if (firstSoundAt === undefined && now - streamStartAt > lastSpeechMs + giveUpMs) {
      break;
    }
    const wait = streamStartAt + window * windowMs - now;
    if (wait > 0) {
      await Bun.sleep(wait);
    }
    const offset = window * windowSamples;
    call.appendAudio(offset < speech.length ? speech.subarray(offset, offset + windowSamples) : silence);
    for (; checked < call.received.length; checked++) {
      const chunk = call.received[checked];
      if (firstSoundAt === undefined && chunk !== undefined && findSoundSpan(chunk.samples, soundThreshold) !== undefined) {
        firstSoundAt = chunk.at;
      }
    }
  }
  call.close();

  const chunks = call.received.map((chunk) => ({
    audioMs: (chunk.samples.length / sampleRate) * 1000,
    readyAt: chunk.at,
    samples: chunk.samples,
  }));
  const playback = planPlayback(chunks, 0);
  // Every time here counts from the start of the stream, which is sample 0 of the utterance.
  const placed = chunks.map((chunk, chunkIndex) => ({
    samples: chunk.samples,
    startMs: (playback.startsAt[chunkIndex] ?? 0) - streamStartAt,
  }));
  const replyTrack = buildRecording({ caller: new Float32Array(0), clips: placed, sampleRate, speechEndSample: 0, tailMs: 0 });
  const span = findSoundSpan(replyTrack, soundThreshold);
  const recordingName = `${set}-${index}.wav`;
  // The recording keeps the whole utterance, which a reply that came early or never may not reach,
  // so the clips are placed from its end.
  const speechMs = (speech.length / sampleRate) * 1000;
  writeFileSync(
    join(recordingsDir, recordingName),
    toWav(
      buildRecording({
        caller: speech,
        clips: placed.map((clip) => ({ samples: clip.samples, startMs: clip.startMs - speechMs })),
        sampleRate,
        speechEndSample: speech.length,
        tailMs: 500,
      }),
      sampleRate,
    ),
  );
  const record: TurnTakingRecord = {
    candidate,
    durationMs: (speech.length / sampleRate) * 1000,
    ...(error === undefined ? {} : { error }),
    ...(span === undefined ? {} : { firstSoundMs: (span.start / sampleRate) * 1000 }),
    id: meta.id,
    index,
    lastSpeechMs,
    recording: recordingName,
    said: call.said(),
    set,
  };
  writeSync(reservation.file, `${JSON.stringify(record)}\n`);
  const verdict =
    record.firstSoundMs === undefined ? 'no reply' : `${Math.round(record.firstSoundMs - lastSpeechMs)} ms after the last speech`;
  console.log(`${candidate} ${set} ${index + 1}/${limit}: ${verdict}`);
}
reservation.release();
