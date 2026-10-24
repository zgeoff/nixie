// Cuts a speech-to-speech reply off and measures how long it goes on in the listener's ear. Each run
// opens a fresh call, asks the long line, and 2 s into the reply streams "Hang on, stop there." A
// client of an API that sends a stop signal drops the audio it holds on that signal, as nixie's
// would. Each run writes one JSON line and a recording of both sides.
// Usage: echo <key> | barge-in.ts --candidate <gpt-live|grok> [--rounds 10] [--out <file>]
//   [--persona results/persona.md] [--replace]
import { mkdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { match } from 'ts-pattern';
import { z } from 'zod';
import type { BargeInRecord } from './barge-in-record.ts';
import { buildRecording } from './build-recording.ts';
import { lines, loadCallerLine } from './caller.ts';
import { findReplyStop } from './find-reply-stop.ts';
import { findSoundSpan } from './find-sound-span.ts';
import { planHeardReply } from './plan-heard-reply.ts';
import { openVendorSocket } from './open-vendor-socket.ts';
import { reserveOutput } from './reserve-output.ts';
import { soundThreshold } from './sound-threshold.ts';
import { sampleRate } from './speech.ts';
import { startGptLiveCall } from './start-gpt-live-call.ts';
import { startGrokCall } from './start-grok-call.ts';
import { toWav } from './to-wav.ts';
import type { VoiceCall } from './voice-call.ts';
import { toRecordingsDir } from './to-recordings-dir.ts';
import { waitForReady } from './wait-for-ready.ts';
import { acknowledgeRules } from './voice-rules.ts';

const { values } = parseArgs({
  options: {
    candidate: { type: 'string' },
    out: { type: 'string' },
    persona: { default: 'results/persona.md', type: 'string' },
    replace: { default: false, type: 'boolean' },
    rounds: { default: '10', type: 'string' },
  },
});
const candidate = z.enum(['gpt-live', 'grok']).parse(values.candidate);
const rounds = z.coerce.number().int().positive().parse(values.rounds);
const out = values.out ?? `results/barge-in-${candidate}.jsonl`;
const recordingsDir = toRecordingsDir(out);
const instructions = `${readFileSync(values.persona, 'utf8').trim()}\n\n${acknowledgeRules}`;
const key = (await new Response(Bun.stdin.stream()).text()).trim();
if (key === '') {
  console.error('pass the API key on stdin');
  process.exit(1);
}
// The caller cuts in this far into the reply, once it is well under way.
const cutInMs = 2000;
// A reply that has not made a sound this long after the question gives the caller nothing to cut.
const giveUpMs = 10_000;
// The call stays open this long after the interruption, to hear whether the reply stops and what
// follows.
const afterMs = 8000;
// A pause between sentences runs to about half a second, so a silence this long means the reply
// stopped.
const stoppedSilenceMs = 700;
const windowSamples = 512;
const windowMs = (windowSamples / sampleRate) * 1000;
// The caller's files hold the barge-in line and the long line straight after the plain lines.
const bargeInIndex = lines.length;
const longLineIndex = lines.length + 1;

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

const question = await loadCallerLine(longLineIndex);
const bargeIn = await loadCallerLine(bargeInIndex);
const cutIn = bargeIn.audio.subarray(0, bargeIn.speechEndSample);
const toSample = (ms: number): number => Math.round((ms * sampleRate) / 1000);
for (let round = 0; round < rounds; round++) {
  const call: VoiceCall =
    candidate === 'grok'
      ? startGrokCall({ instructions, key, openSocket: openVendorSocket, sampleRate, voice: 'eve' })
      : startGptLiveCall({
          instructions,
          key,
          openSocket: openVendorSocket,
          quietMs: 2500,
          runDelegation: () => Promise.resolve('That lookup is not available right now.'),
          sampleRate,
          soundThreshold,
          voice: 'marin',
        });
  let error: string | undefined;
  // A reply that ends, or is cut off, settles the call; the run listens on for a fixed time instead.
  call.ended.catch((reason: unknown) => {
    error = String(reason);
  });
  error ??= await waitForReady(call.ready, 10_000);
  const streamStartAt = performance.now();
  const questionEndMs = (question.speechEndSample / sampleRate) * 1000;
  const silence = new Float32Array(windowSamples);
  let firstSoundAt: number | undefined;
  let checked = 0;
  let cutInWindow: number | undefined;
  for (let window = 0; error === undefined; window++) {
    const now = performance.now();
    const elapsedMs = now - streamStartAt;
    if (cutInWindow === undefined && firstSoundAt === undefined && elapsedMs > questionEndMs + giveUpMs) {
      break;
    }
    if (cutInWindow !== undefined && (window - cutInWindow) * windowMs > afterMs) {
      break;
    }
    for (; checked < call.received.length; checked++) {
      const chunk = call.received[checked];
      if (firstSoundAt === undefined && chunk !== undefined && findSoundSpan(chunk.samples, soundThreshold) !== undefined) {
        firstSoundAt = chunk.at;
      }
    }
    const questionOffset = window * windowSamples;
    if (
      cutInWindow === undefined &&
      firstSoundAt !== undefined &&
      now - firstSoundAt >= cutInMs &&
      questionOffset >= question.speechEndSample
    ) {
      cutInWindow = window;
    }
    const wait = streamStartAt + window * windowMs - now;
    if (wait > 0) {
      await Bun.sleep(wait);
    }
    const cutInOffset = cutInWindow === undefined ? -1 : (window - cutInWindow) * windowSamples;
    call.appendAudio(
      questionOffset < question.speechEndSample
        ? question.audio.subarray(questionOffset, questionOffset + windowSamples)
        : cutInOffset >= 0 && cutInOffset < cutIn.length
          ? cutIn.subarray(cutInOffset, cutInOffset + windowSamples)
          : silence,
    );
  }
  call.close();

  const cutInAt = cutInWindow === undefined ? undefined : streamStartAt + cutInWindow * windowMs;
  const stopAt = cutInAt === undefined ? undefined : call.stopPlaybackAt.find((at) => at >= cutInAt);
  const heard = planHeardReply({ received: call.received, sampleRate, stopAt });
  // Every time here counts from the start of the stream, which is sample 0 of the recording.
  const placed = heard.map((clip) => ({ samples: clip.samples, startMs: clip.startAt - streamStartAt }));
  // The call listened on after the interruption, so the reply track runs through that window: a
  // reply that stops with nothing after it still shows the silence that marks its stop.
  const heardTrack = buildRecording({ caller: new Float32Array(0), clips: placed, sampleRate, speechEndSample: 0, tailMs: 0 });
  const replyTrack = new Float32Array(
    Math.max(heardTrack.length, cutInWindow === undefined ? 0 : cutInWindow * windowSamples + toSample(afterMs)),
  );
  replyTrack.set(heardTrack);
  const callerTrack = new Float32Array(Math.max(question.speechEndSample, replyTrack.length) + toSample(1000));
  callerTrack.set(question.audio.subarray(0, question.speechEndSample));
  if (cutInWindow !== undefined) {
    callerTrack.set(cutIn.subarray(0, callerTrack.length - cutInWindow * windowSamples), cutInWindow * windowSamples);
  }
  const recordingName = `r${round}.wav`;
  writeFileSync(
    join(recordingsDir, recordingName),
    toWav(buildRecording({ caller: callerTrack, clips: placed, sampleRate, speechEndSample: 0, tailMs: 500 }), sampleRate),
  );
  const cutInSample = cutInWindow === undefined ? undefined : cutInWindow * windowSamples;
  const stopSample =
    cutInSample === undefined
      ? undefined
      : findReplyStop({
          minSilenceSamples: toSample(stoppedSilenceMs),
          samples: replyTrack,
          start: cutInSample,
          threshold: soundThreshold,
        });
  const record: BargeInRecord = {
    candidate,
    ...(error === undefined ? {} : { error }),
    interrupted: cutInSample !== undefined,
    recording: recordingName,
    round,
    said: call.said(),
    spokeAfterStop:
      stopSample !== undefined && findSoundSpan(replyTrack.subarray(stopSample), soundThreshold) !== undefined,
    ...(stopSample === undefined || cutInSample === undefined
      ? {}
      : { stopMs: ((stopSample - cutInSample) / sampleRate) * 1000 }),
  };
  writeSync(reservation.file, `${JSON.stringify(record)}\n`);
  const verdict = match(record)
    .with({ interrupted: false }, () => 'no reply to interrupt')
    .with({ stopMs: undefined }, () => 'never stopped')
    .otherwise((stopped) => `stopped ${Math.round(stopped.stopMs ?? 0)} ms after the interruption`);
  console.log(`${candidate} round ${round}: ${verdict}`);
}
reservation.release();
