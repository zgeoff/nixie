// Times one way of speaking nixie's reply, from the end of the caller's speech to the first audio
// and the full answer, over the caller's lines and the lines that call a stub tool. Each turn writes
// one JSON line and one recording of the exchange as a listener hears it.
// Usage: reply.ts --candidate <haiku-clauses|haiku-clauses-thinking-off|sonnet-opener> [--out <file>] [--rounds 3]
//   [--persona results/persona.md] [--gap-tolerance-ms 150] [--limit <n>] [--replace]
// The persona is nixie's own, read from the deployment's definitions into a git-ignored file. A
// broker that adds the Cloudflare key leaves --cloudflare-token empty.
import { mkdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { buildRecording } from './build-recording.ts';
import { lines, loadCallerLine, toolLineStart, toolLines } from './caller.ts';
import { collectClauses } from './collect-clauses.ts';
import type { OpenerName } from './create-opener-picker.ts';
import { createOpenerPicker, openerName, openers } from './create-opener-picker.ts';
import { createVoiceTools, voiceToolNames } from './create-voice-tools.ts';
import { listenToCaller } from './listen.ts';
import type { PlayedClip } from './plan-playback.ts';
import { planPlayback } from './plan-playback.ts';
import type { ReplyRecord } from './reply-record.ts';
import { findSoundSpan } from './find-sound-span.ts';
import { reserveOutput } from './reserve-output.ts';
import { soundThreshold } from './sound-threshold.ts';
import {
  createSpeechToText,
  createTextToSpeech,
  createVad,
  longWarmUp,
  sampleRate,
  toSampleRate,
} from './speech.ts';
import type { AgentSessionOptions } from './start-agent-session.ts';
import { startAgentSession } from './start-agent-session.ts';
import { toWav } from './to-wav.ts';
import { acknowledgeRules, openerSpokenRules } from './voice-rules.ts';

const { values } = parseArgs({
  options: {
    candidate: { type: 'string' },
    'cloudflare-account': { type: 'string' },
    'cloudflare-token': { default: '', type: 'string' },
    'gap-tolerance-ms': { default: '150', type: 'string' },
    limit: { type: 'string' },
    out: { type: 'string' },
    persona: { default: 'results/persona.md', type: 'string' },
    replace: { default: false, type: 'boolean' },
    rounds: { default: '3', type: 'string' },
  },
});
const candidate = z
  .enum(['haiku-clauses', 'haiku-clauses-thinking-off', 'sonnet-opener'])
  .parse(values.candidate);
const rounds = z.coerce.number().int().positive().parse(values.rounds);
const gapToleranceMs = z.coerce.number().nonnegative().parse(values['gap-tolerance-ms']);
const limit =
  values.limit === undefined ? Number.POSITIVE_INFINITY : z.coerce.number().int().positive().parse(values.limit);
const out = values.out ?? `results/reply-${candidate}.jsonl`;
const recordingsDir = join(dirname(out), 'recordings', candidate);
const persona = readFileSync(values.persona, 'utf8').trim();
// A clause of fewer words waits for the next break, so Piper never speaks a one-word fragment.
const minClauseWords = 4;
// The 500 ms pause the earlier runs ended each turn on, so these times compare with theirs.
const silenceMs = 500;

const setup: Pick<AgentSessionOptions, 'effort' | 'model' | 'thinking'> & { voiceRules: string } = match(candidate)
  .with('haiku-clauses', () => ({
    effort: 'low' as const,
    model: 'claude-haiku-5-5',
    voiceRules: acknowledgeRules,
  }))
  .with('haiku-clauses-thinking-off', () => ({
    effort: 'low' as const,
    model: 'claude-haiku-5-5',
    thinking: { type: 'disabled' },
    voiceRules: acknowledgeRules,
  }))
  .with('sonnet-opener', () => ({
    effort: 'low' as const,
    model: 'claude-sonnet-5-5',
    thinking: { display: 'omitted', type: 'adaptive' },
    voiceRules: openerSpokenRules,
  }))
  .exhaustive();

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

const stt = createSpeechToText('zipformer');
const tts = createTextToSpeech('piper');
const vad = createVad(silenceMs);
const picker =
  candidate === 'sonnet-opener'
    ? createOpenerPicker({
        accountID: z.string().min(1).parse(values['cloudflare-account']),
        token: values['cloudflare-token'],
        transport: fetch,
      })
    : undefined;
const openerAudio = new Map<OpenerName, Float32Array>();
if (picker !== undefined) {
  for (const name of openerName.options) {
    const spoken = await tts.speak(openers[name].phrase);
    openerAudio.set(name, toSampleRate(spoken.samples, spoken.sampleRate));
  }
}
await tts.speak('Hello.');
await tts.speak(longWarmUp);
const turnLines = [
  ...lines.map((text, index) => ({ callerIndex: index, needsTool: false, text })),
  ...toolLines.map((text, index) => ({ callerIndex: toolLineStart + index, needsTool: true, text })),
].slice(0, limit);

interface Clip extends PlayedClip {
  samples: Float32Array;
  text: string;
  textAt: number;
  ttsMs: number;
}

for (let round = 0; round < rounds; round++) {
  // Each round is a call of its own. One session across rounds let the model see each question
  // again and answer from its earlier reply, often by saying so, instead of calling the tool.
  const session = startAgentSession({
    allowedTools: voiceToolNames,
    effort: setup.effort,
    model: setup.model,
    systemPrompt: `${persona}\n\n${setup.voiceRules}`,
    ...(setup.thinking === undefined ? {} : { thinking: setup.thinking }),
    tools: createVoiceTools(),
  });
  // The first turn starts the process, so its time is per call, not per turn, and goes unrecorded.
  await session.runTurn('Say hello in one short sentence.', () => undefined);
  for (const turnLine of turnLines) {
    const line = await loadCallerLine(turnLine.callerIndex);
    const heard = await listenToCaller(line.audio, line.speechEndSample, stt.start(), vad);
    const endAt = heard.speechEndAt;
    const clauses: Clip[] = [];
    let queue = Promise.resolve();
    let pending = '';
    let text = '';
    let firstTextAt: number | undefined;
    const speak = (clause: string, textAt: number): void => {
      queue = queue.then(async () => {
        const spoken = await tts.speak(clause);
        const samples = toSampleRate(spoken.samples, spoken.sampleRate);
        clauses.push({
          audioMs: (samples.length / sampleRate) * 1000,
          readyAt: performance.now(),
          samples,
          text: clause,
          textAt,
          ttsMs: spoken.totalMs,
        });
      });
    };
    const opening = picker?.pickOpener(heard.transcript).then((picked) => ({ ...picked, at: performance.now() }));
    const turn = await session.runTurn(heard.transcript, (delta, at) => {
      firstTextAt ??= at;
      text += delta;
      const collected = collectClauses(pending + delta, minClauseWords);
      pending = collected.rest;
      for (const clause of collected.clauses) {
        speak(clause, at);
      }
    });
    if (pending.trim() !== '') {
      speak(pending.trim(), turn.resultAt);
    }
    await queue;
    const opened = opening === undefined ? undefined : await opening;
    const openerSamples = opened === undefined ? undefined : openerAudio.get(opened.opener);
    const clips: Clip[] =
      opened === undefined || openerSamples === undefined
        ? clauses
        : [
            {
              audioMs: (openerSamples.length / sampleRate) * 1000,
              readyAt: opened.at,
              samples: openerSamples,
              text: openers[opened.opener].phrase,
              textAt: opened.at,
              ttsMs: 0,
            },
            ...clauses,
          ];
    const playback = planPlayback(clips, gapToleranceMs);
    const recording = buildRecording({
      caller: line.audio,
      clips: clips.map((clip, index) => ({ samples: clip.samples, startMs: (playback.startsAt[index] ?? 0) - endAt })),
      sampleRate,
      speechEndSample: line.speechEndSample,
      tailMs: 1000,
    });
    const recordingName = `r${round}-l${turnLine.callerIndex}.wav`;
    writeFileSync(join(recordingsDir, recordingName), toWav(recording, sampleRate));
    // Piper's clips open with a short silence, so first audio is the first audible sample, as the
    // speech-to-speech runner measures it, and not the first clip's start.
    const heardSpan = findSoundSpan(recording.subarray(line.speechEndSample), soundThreshold);
    const last = clips.at(-1);
    const record: ReplyRecord = {
      candidate,
        clips: clips.map((clip) => ({
          audioMs: Math.round(clip.audioMs),
          readyMs: Math.round(clip.readyAt - endAt),
          text: clip.text,
          textMs: Math.round(clip.textAt - endAt),
          ttsMs: Math.round(clip.ttsMs),
        })),
        costUSD: turn.costUSD,
        endpointMs: heard.vadEndAt - endAt,
        firstAudioMs: heardSpan === undefined ? undefined : (heardSpan.start / sampleRate) * 1000,
        firstTextMs: firstTextAt === undefined ? undefined : firstTextAt - endAt,
        fullAudioMs: last === undefined ? undefined : last.readyAt - endAt,
        fullTextMs: turn.resultAt - endAt,
        gapMs: playback.gapMs,
        gapToleranceMs,
        gaps: playback.gaps,
        isError: turn.isError,
        line: turnLine.callerIndex,
        load1: loadavg()[0],
        model: setup.model,
        needsTool: turnLine.needsTool,
        opener: opened === undefined ? undefined : { confidence: opened.confidence, name: opened.opener, readyMs: opened.at - endAt },
        playEndMs: playback.playEndAt - endAt,
        recording: recordingName,
        round,
        speechMs: (line.speechEndSample / sampleRate) * 1000,
        sttMs: heard.transcriptAt - heard.vadEndAt,
        subtype: turn.subtype,
        text,
        toolCalls: turn.toolCalls,
        transcript: heard.transcript,
        ttftStreamMs: turn.ttftStreamMs,
    };
    writeSync(reservation.file, `${JSON.stringify(record)}\n`);
    console.log(`${candidate} round ${round} line ${turnLine.callerIndex}: ${text.replaceAll('\n', ' ')}`);
  }
  session.close();
}

reservation.release();
