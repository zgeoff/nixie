// Times a speech-to-speech candidate over the same caller lines as reply.ts: one fresh call per
// line, the caller's audio streamed in real time and then silence, and the reply's audio played
// back in the order it arrived. Each turn writes one JSON line and one recording.
// Usage: echo <key> | speech-to-speech.ts --candidate <gpt-live|grok> [--out <file>] [--rounds 3]
//   [--persona results/persona.md] [--limit <n>] [--replace]
// The key comes on stdin, so it never reaches the command line or a file. GPT-Live hands real
// requests to nixie's Claude turn, which runs on the broker's credential like the pipelines.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { loadavg, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { buildRecording } from './build-recording.ts';
import { lines, loadCallerLine, toolLineStart, toolLines } from './caller.ts';
import { createVoiceTools, voiceToolNames } from './create-voice-tools.ts';
import { findSoundSpan } from './find-sound-span.ts';
import { planPlayback } from './plan-playback.ts';
import type { ReplyRecord } from './reply-record.ts';
import { openVendorSocket } from './open-vendor-socket.ts';
import { pickAgentEnv } from './pick-agent-env.ts';
import { reserveOutput } from './reserve-output.ts';
import { soundThreshold } from './sound-threshold.ts';
import { sampleRate } from './speech.ts';
import { startAgentSession } from './start-agent-session.ts';
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
    limit: { type: 'string' },
    out: { type: 'string' },
    persona: { default: 'results/persona.md', type: 'string' },
    replace: { default: false, type: 'boolean' },
    rounds: { default: '3', type: 'string' },
  },
});
const candidate = z.enum(['gpt-live', 'grok']).parse(values.candidate);
const rounds = z.coerce.number().int().positive().parse(values.rounds);
const limit =
  values.limit === undefined ? Number.POSITIVE_INFINITY : z.coerce.number().int().positive().parse(values.limit);
const out = values.out ?? `results/reply-${candidate}.jsonl`;
const recordingsDir = toRecordingsDir(out);
const persona = readFileSync(values.persona, 'utf8').trim();
const key = (await new Response(Bun.stdin.stream()).text()).trim();
if (key === '') {
  console.error('pass the API key on stdin');
  process.exit(1);
}
// The pipelines' tolerance, so a wait for the next chunk counts the same way.
const gapToleranceMs = 150;
// GPT-Live sends no event when it stops speaking, so a turn ends after this long with no sound.
const quietMs = 2500;
// A turn that never ends gives up here and counts as failed.
const maxTurnMs = 40_000;
const windowSamples = 512;
const windowMs = (windowSamples / sampleRate) * 1000;
const pricePerMinuteUSD = { 'gpt-live': 0.05, grok: 0.08 }[candidate];
const model = { 'gpt-live': 'gpt-live-1', grok: 'grok-voice-3.0' }[candidate];
const toolRules =
  candidate === 'gpt-live'
    ? 'For the weather, the person\'s calendar or a timer, hand the request to your backend and say only what it returns.'
    : "Use your tools for the weather, the person's calendar or a timer.";
const instructions = `${persona}\n\n${acknowledgeRules} ${toolRules}`;

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

const turnLines = [
  ...lines.map((text, index) => ({ callerIndex: index, needsTool: false, text })),
  ...toolLines.map((text, index) => ({ callerIndex: toolLineStart + index, needsTool: true, text })),
].slice(0, limit);

for (let round = 0; round < rounds; round++) {
  // GPT-Live's backend is nixie's Claude turn, one session per round as in the pipeline runs.
  const backend =
    candidate === 'gpt-live'
      ? startAgentSession({
          allowedTools: voiceToolNames,
          effort: 'low',
          env: pickAgentEnv(process.env),
          model: 'claude-sonnet-5-5',
          query,
          scratchDir: mkdtempSync(join(tmpdir(), 'voice-reply-')),
          systemPrompt: `${persona}\n\nYou answer for a voice assistant, which speaks your reply. Answer in one or two short spoken sentences, with no lists and no markdown.`,
          thinking: { display: 'omitted', type: 'adaptive' },
          tools: createVoiceTools(),
          writeLog: (line) => process.stderr.write(line),
        })
      : undefined;
  for (const turnLine of turnLines) {
    const line = await loadCallerLine(turnLine.callerIndex);
    let backendCostUSD = 0;
    const call: VoiceCall =
      backend === undefined
        ? startGrokCall({ instructions, key, openSocket: openVendorSocket, sampleRate, voice: 'eve' })
        : startGptLiveCall({
            instructions,
            key,
            openSocket: openVendorSocket,
            quietMs,
            runDelegation: async (heard) => {
              let answer = '';
              const turn = await backend.runTurn(heard, (delta) => {
                answer += delta;
              });
              backendCostUSD += turn.costUSD;
              if (turn.isError) {
                throw new Error(`the Claude turn failed: ${turn.subtype}`);
              }
              return answer;
            },
            sampleRate,
            soundThreshold,
            voice: 'marin',
          });
    const openedAt = performance.now();
    let failure: string | undefined;
    let ended = false;
    call.ended.then(
      () => {
        ended = true;
      },
      (error: unknown) => {
        ended = true;
        failure = String(error);
      },
    );
    const notReady = await waitForReady(call.ready, 10_000);
    if (notReady !== undefined) {
      failure ??= notReady;
      ended = true;
    }
    const streamStartAt = performance.now();
    const speechEndWindow = Math.ceil(line.speechEndSample / windowSamples) - 1;
    const speechEndAt = streamStartAt + speechEndWindow * windowMs;
    const silence = new Float32Array(windowSamples);
    for (let index = 0; !ended && index * windowMs < maxTurnMs; index++) {
      const wait = streamStartAt + index * windowMs - performance.now();
      if (wait > 0) {
        await Bun.sleep(wait);
      }
      const offset = index * windowSamples;
      call.appendAudio(offset < line.audio.length ? line.audio.subarray(offset, offset + windowSamples) : silence);
    }
    if (!ended) {
      failure = `the reply did not end within ${maxTurnMs} ms`;
    }
    const sessionMs = performance.now() - openedAt;
    call.close();

    const chunks = call.received.map((chunk) => ({
      audioMs: (chunk.samples.length / sampleRate) * 1000,
      readyAt: chunk.at,
      samples: chunk.samples,
    }));
    const playback = planPlayback(chunks, gapToleranceMs);
    const placed = chunks.map((chunk, index) => ({
      samples: chunk.samples,
      startMs: (playback.startsAt[index] ?? 0) - speechEndAt,
    }));
    const replyTrack = buildRecording({
      caller: new Float32Array(line.speechEndSample),
      clips: placed,
      sampleRate,
      speechEndSample: line.speechEndSample,
      tailMs: 0,
    });
    const span = findSoundSpan(replyTrack, soundThreshold);
    const recordingName = `r${round}-l${turnLine.callerIndex}.wav`;
    writeFileSync(
      join(recordingsDir, recordingName),
      toWav(
        buildRecording({ caller: line.audio, clips: placed, sampleRate, speechEndSample: line.speechEndSample, tailMs: 1000 }),
        sampleRate,
      ),
    );
    const toMs = (sample: number): number => ((sample - line.speechEndSample) / sampleRate) * 1000;
    const lastSounding = chunks.findLast((chunk) => findSoundSpan(chunk.samples, soundThreshold) !== undefined);
    const record: ReplyRecord = {
      candidate,
      clips: [],
      // The voice API's price for the time the call was open, plus the Claude backend's turns.
      costUSD: (pricePerMinuteUSD * sessionMs) / 60_000 + backendCostUSD,
      firstAudioMs: span === undefined ? undefined : toMs(span.start),
      fullAudioMs: lastSounding === undefined ? undefined : lastSounding.readyAt - speechEndAt,
      gapMs: playback.gapMs,
      gapToleranceMs,
      gaps: playback.gaps,
      isError: failure !== undefined || span === undefined,
      line: turnLine.callerIndex,
      load1: loadavg()[0],
      model,
      needsTool: turnLine.needsTool,
      playEndMs: span === undefined ? 0 : toMs(span.end),
      recording: recordingName,
      round,
      speechMs: (line.speechEndSample / sampleRate) * 1000,
      subtype: failure ?? 'success',
      text: call.said(),
      toolCalls: call.toolCalls,
      transcript: call.heard(),
    };
    writeSync(reservation.file, `${JSON.stringify(record)}\n`);
    console.log(`${candidate} round ${round} line ${turnLine.callerIndex}: ${record.text.replaceAll('\n', ' ')}`);
  }
  backend?.close();
}

reservation.release();
