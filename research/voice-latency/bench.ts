// Runs voice calls end to end: the caller's audio in real time, voice activity detection, one
// speech-to-text candidate, Haiku 5.5 on one live `stream` process, and one text-to-speech
// candidate that speaks each sentence as it arrives. Appends one JSON line per turn.
// Usage: bench.ts --out <file> --stt <name> --tts <name> [--rounds 2] [--barge-ins 3]
//   [--silence-ms 500] [--barge-in-after-ms 1500] [--control] [--warm-long]
// --control sends each line's text with no speech stages running, to time the turn alone on the
// same host. --warm-long speaks one long sentence before the first turn, as well as a short one.
import { once } from 'node:events';
import { appendFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { loadavg, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Options, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { ResultFields } from './build-result-fields.ts';
import { buildResultFields } from './build-result-fields.ts';
import { bargeIn, lines, loadCallerLine, longLine } from './caller.ts';
import type { Heard } from './listen.ts';
import { listenToCaller, waitUntil } from './listen.ts';
import { planPlayback } from './plan-playback.ts';
import type { SpeechToTextName, TextToSpeech, TextToSpeechName } from './speech.ts';
import { createSpeechToText, createTextToSpeech, createVad, longWarmUp, sampleRate } from './speech.ts';

// The persona asks for the opening acknowledgement from decision 0040.
const persona = [
  'You are Nixie, a warm and brief personal assistant on a voice call.',
  'Open every reply with a short acknowledgement of two to four words, such as "Sure, let me think." or "Good question.",',
  'that never claims an outcome or makes a promise.',
  'Then answer in two or three short spoken sentences, with no lists and no markdown.',
].join(' ');
const model = 'claude-haiku-5-5';
const out = readFlag('--out') ?? 'results/bench.jsonl';
const rounds = Number(readFlag('--rounds') ?? 2);
const bargeIns = Number(readFlag('--barge-ins') ?? 3);
const silenceMs = Number(readFlag('--silence-ms') ?? 500);
const sttName = (readFlag('--stt') ?? 'zipformer') as SpeechToTextName;
const ttsName = (readFlag('--tts') ?? 'piper') as TextToSpeechName;
// The barge-in starts this long after nixie's first audio starts to play.
const bargeInAfterMs = Number(readFlag('--barge-in-after-ms') ?? 1500);
const control = process.argv.includes('--control');
const warmLong = process.argv.includes('--warm-long');

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

// A prompt queue that stays open for the whole call, so one process serves every turn.
interface Stream {
  closed: boolean;
  events: EventTarget;
  queue: SDKUserMessage[];
}

async function* sendQueued(stream: Stream): AsyncGenerator<SDKUserMessage> {
  while (!stream.closed) {
    const next = stream.queue.shift();
    if (next) {
      yield next;
    } else {
      await once(stream.events, 'push');
    }
  }
}

function sendPrompt(stream: Stream, text: string): void {
  stream.queue.push({
    message: { content: text, role: 'user' },
    parent_tool_use_id: null,
    type: 'user',
  });
  stream.events.dispatchEvent(new Event('push'));
}

function buildOptions(): Options {
  const scratch = mkdtempSync(join(tmpdir(), 'voice-latency-'));
  return {
    allowedTools: [],
    cwd: scratch,
    effort: 'low',
    env: {
      ...pickEnv(),
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_CONFIG_DIR: join(scratch, 'config'),
    },
    includePartialMessages: true,
    maxTurns: 1,
    mcpServers: {},
    model,
    permissionMode: 'dontAsk',
    permissionPrompts: 'none',
    settingSources: [],
    stderr: (data) => {
      process.stderr.write(`[stderr] ${data}`);
    },
    strictMcpConfig: true,
    systemPrompt: { prompt: persona, snapshot: false, type: 'custom' },
    tools: [],
  };
}

// The credential and the network settings the CLI needs, and nothing else from this shell.
function pickEnv(): Record<string, string> {
  const keys = [
    'ANTHROPIC_API_KEY',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'HOME',
    'HTTPS_PROXY',
    'NODE_EXTRA_CA_CERTS',
    'NODE_USE_ENV_PROXY',
    'NO_PROXY',
    'PATH',
    'SSL_CERT_FILE',
    'https_proxy',
    'no_proxy',
  ];
  return Object.fromEntries(
    keys.flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
  ) as Record<string, string>;
}

// One spoken sentence: when its text was complete, when its audio was ready, and how long it plays.
interface Sentence {
  audioMs: number;
  readyAt: number;
  text: string;
  textAt: number;
  ttsMs: number;
}

interface Reply {
  costUSD?: number;
  firstTextAt?: number;
  isError?: boolean;
  requestingAt?: number;
  resultAt?: number;
  ttftStreamMs?: number;
  sentences: Sentence[];
  subtype?: string;
  text: string;
}

// Splits the streamed text into sentences and speaks each in order on one synthesis queue.
function startReply(tts: TextToSpeech): {
  addText: (delta: string, at: number) => void;
  finish: () => Promise<Sentence[]>;
  flush: () => void;
  reply: Reply;
  stop: () => void;
} {
  const reply: Reply = { sentences: [], text: '' };
  let pending = '';
  let queue = Promise.resolve();
  let stopped = false;
  // Queues the text after the last sentence break, once the turn's text is complete.
  function flushPending(): void {
    if (pending.trim()) {
      speakSentence(pending.trim(), performance.now());
      pending = '';
    }
  }
  function speakSentence(text: string, textAt: number): void {
    queue = queue.then(async () => {
      if (stopped) {
        return;
      }
      const spoken = await tts.speak(text);
      reply.sentences.push({
        audioMs: (spoken.samples.length / spoken.sampleRate) * 1000,
        readyAt: performance.now(),
        text,
        textAt,
        ttsMs: spoken.totalMs,
      });
    });
    // A barge-in trial can stop the speaker without waiting on the queue, so a failed synthesis is
    // marked handled here; the queue still rejects when the bench waits on it.
    queue.catch(() => undefined);
  }
  return {
    addText: (delta, at) => {
      reply.firstTextAt ??= at;
      reply.text += delta;
      pending += delta;
      for (let match = /^(.*?[.!?])\s+/s.exec(pending); match; ) {
        speakSentence((match[1] ?? '').trim(), at);
        pending = pending.slice(match[0].length);
        match = /^(.*?[.!?])\s+/s.exec(pending);
      }
    },
    finish: async () => {
      flushPending();
      await queue;
      return reply.sentences;
    },
    flush: flushPending,
    reply,
    stop: () => {
      stopped = true;
    },
  };
}

mkdirSync(dirname(out), { recursive: true });
const stt = createSpeechToText(control ? 'zipformer' : sttName);
const tts: TextToSpeech = control
  ? {
      name: 'piper',
      sampleRate,
      speak: () =>
        Promise.resolve({ firstChunkMs: 0, sampleRate, samples: new Float32Array(), totalMs: 0 }),
    }
  : createTextToSpeech(ttsName);
const endVad = createVad(silenceMs);
const onsetVad = createVad(silenceMs);
const stream: Stream = { closed: false, events: new EventTarget(), queue: [] };
const session = query({ options: buildOptions(), prompt: sendQueued(stream) });
const messages = session[Symbol.asyncIterator]();
await tts.speak('Hello.');
if (warmLong) {
  await tts.speak(longWarmUp);
}

interface TurnResult extends ResultFields {
  costUSD: number;
  requestingAt?: number;
  resultAt: number;
}

let sessionCostUSD = 0;

// Reads messages until the turn's result, and passes each text delta to the reply.
async function readTurn(onText: (delta: string, at: number) => void): Promise<TurnResult> {
  let requestingAt: number | undefined;
  for (;;) {
    const next = await messages.next();
    if (next.done) {
      throw new Error('the session ended mid-turn');
    }
    const message: SDKMessage = next.value;
    const at = performance.now();
    if (message.type === 'stream_event' && message.parent_tool_use_id === null) {
      const { event } = message;
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        onText(event.delta.text, at);
      }
    } else if (message.type === 'system' && message.subtype === 'status') {
      requestingAt ??= message.status === 'requesting' ? at : undefined;
    } else if (message.type === 'result') {
      // total_cost_usd counts the whole session, so each turn keeps the difference.
      const costUSD = message.total_cost_usd - sessionCostUSD;
      sessionCostUSD = message.total_cost_usd;
      return { ...buildResultFields(message), costUSD, requestingAt, resultAt: at };
    }
  }
}

// Turn 1 starts the process. Its time is per call, not per turn, so it goes unrecorded, as the
// first-token spike's stream mode did.
sendPrompt(stream, 'Say hello in one short sentence.');
await readTurn(() => undefined);

function writeRow(row: Record<string, unknown>): void {
  appendFileSync(
    out,
    `${JSON.stringify({
      load1: loadavg()[0],
      model,
      silenceMs,
      warmLong,
      stt: control ? 'control' : sttName,
      tts: control ? 'none' : ttsName,
      ...row,
    })}\n`,
  );
}

async function runTurn(index: number): Promise<{ heard: Heard; reply: Reply }> {
  const line = await loadCallerLine(index);
  const heard = control
    ? buildTypedLine(line.text)
    : await listenToCaller(line.audio, line.speechEndSample, stt.start(), endVad);
  const speaker = startReply(tts);
  const promptAt = performance.now();
  sendPrompt(stream, heard.transcript);
  const result = await readTurn(speaker.addText);
  await speaker.finish();
  Object.assign(speaker.reply, result);
  return { heard: { ...heard, transcriptAt: promptAt }, reply: speaker.reply };
}

function buildTypedLine(text: string): Heard {
  const at = performance.now();
  return { speechEndAt: at, transcript: text, transcriptAt: at, vadEndAt: at };
}

function writeTurnRow(kind: string, round: number, index: number, heard: Heard, reply: Reply): void {
  const end = heard.speechEndAt;
  const first = reply.sentences[0];
  const last = reply.sentences.at(-1);
  const playback = planPlayback(reply.sentences, 0);
  // A control turn speaks nothing, so its row holds no audio or playback times.
  const audio = control
    ? {}
    : {
        firstAudioMs: first ? first.readyAt - end : undefined,
        fullAudioMs: last ? last.readyAt - end : undefined,
        gapMs: playback.gapMs,
        gaps: playback.gaps,
        playEndMs: playback.playEndAt - end,
      };
  writeRow({
    ...audio,
    ackWords: first?.text.split(/\s+/).length,
    costUSD: reply.costUSD,
    endpointMs: heard.vadEndAt - end,
    firstSentenceMs: first ? first.textAt - end : undefined,
    firstTextMs: reply.firstTextAt === undefined ? undefined : reply.firstTextAt - end,
    fullTextMs: reply.resultAt === undefined ? undefined : reply.resultAt - end,
    isError: reply.isError,
    kind,
    line: index,
    promptMs: heard.transcriptAt - end,
    // The SDK's own share: from the prompt to the CLI's model request.
    requestMs: reply.requestingAt === undefined ? undefined : reply.requestingAt - heard.transcriptAt,
    // The model's share as the CLI saw it: from the request to the first streamed event.
    ttftStreamMs: reply.ttftStreamMs,
    round,
    sentences: reply.sentences.map((s) => ({
      audioMs: Math.round(s.audioMs),
      text: s.text,
      textMs: Math.round(s.textAt - end),
      ttsMs: Math.round(s.ttsMs),
    })),
    subtype: reply.subtype,
    sttMs: heard.transcriptAt - heard.vadEndAt,
    transcript: heard.transcript,
  });
}

for (let round = 0; round < rounds; round++) {
  for (const index of lines.keys()) {
    const { heard, reply } = await runTurn(index);
    writeTurnRow('turn', round, index, heard, reply);
    console.log(`${sttName}+${ttsName} round ${round} line ${index}: ${reply.text.replaceAll('\n', ' ')}`);
  }
}

// Barge-in: the caller talks over a long reply. The onset detector hears the caller's audio from
// the barge-in's start; playback stops when it reports speech, and the turn is interrupted if the
// model is still writing.
const bargeLine = await loadCallerLine(lines.length);
const longIndex = lines.length + 1;
for (let trial = 0; trial < bargeIns; trial++) {
  const line = await loadCallerLine(longIndex);
  const heard = await listenToCaller(line.audio, line.speechEndSample, stt.start(), endVad);
  const speaker = startReply(tts);
  sendPrompt(stream, heard.transcript);
  let resultSeen = false;
  let turnError: unknown;
  const turn = readTurn(speaker.addText).then((result) => {
    resultSeen = true;
    // The last sentence joins the queue as soon as the text ends, as on an ordinary turn.
    speaker.flush();
    return result;
  });
  turn.catch((error: unknown) => {
    turnError = error;
  });
  // Waits for the first sentence's audio. The result flushes any text after the last sentence
  // break, so a one-sentence reply still plays; waiting on the whole queue here would start the
  // barge-in late.
  while (speaker.reply.sentences.length === 0) {
    if (turnError !== undefined) {
      throw turnError;
    }
    if (resultSeen && speaker.reply.text.trim() === '') {
      throw new Error('the reply held no text');
    }
    await Bun.sleep(5);
  }
  const playStartAt = speaker.reply.sentences[0]?.readyAt ?? performance.now();
  const bargeStartAt = playStartAt + bargeInAfterMs;
  await waitUntil(bargeStartAt);
  onsetVad.reset();
  const window = 512;
  let detectedAt: number | undefined;
  for (let offset = 0, i = 0; offset < bargeLine.audio.length; offset += window, i++) {
    await waitUntil(bargeStartAt + (i * window * 1000) / sampleRate);
    onsetVad.accept(bargeLine.audio.subarray(offset, offset + window));
    if (onsetVad.isSpeaking()) {
      detectedAt = performance.now();
      break;
    }
  }
  speaker.stop();
  const interruptedAt = performance.now();
  const wasWriting = !resultSeen;
  if (wasWriting) {
    await session.interrupt();
  }
  const result = await turn;
  const sentences = await speaker.finish();
  const heardMs = (detectedAt ?? interruptedAt) - playStartAt;
  const spoken = planPlayback(sentences, 0);
  writeRow({
    bargeInAfterMs,
    costUSD: result.costUSD,
    detectMs: detectedAt === undefined ? undefined : detectedAt - bargeStartAt,
    heardMs,
    interruptToResultMs: wasWriting ? result.resultAt - interruptedAt : undefined,
    isError: result.isError,
    kind: 'barge-in',
    replyMs: spoken.playEndAt - playStartAt,
    sentencesReady: sentences.length,
    subtype: result.subtype,
    textChars: speaker.reply.text.length,
    trial,
    wasWriting,
  });
  console.log(`barge-in ${trial}: detected after ${detectedAt === undefined ? '-' : Math.round(detectedAt - bargeStartAt)} ms`);
  // The caller's barge-in line becomes the next prompt, as it would on a call.
  const after = await listenToCaller(
    bargeLine.audio,
    bargeLine.speechEndSample,
    stt.start(),
    endVad,
  );
  const next = startReply(tts);
  sendPrompt(stream, after.transcript);
  const nextResult = await readTurn(next.addText);
  await next.finish();
  writeRow({
    costUSD: nextResult.costUSD,
    isError: nextResult.isError,
    kind: 'after-barge-in',
    subtype: nextResult.subtype,
    text: next.reply.text,
    trial,
  });
}

stream.closed = true;
stream.events.dispatchEvent(new Event('push'));
session.close();
