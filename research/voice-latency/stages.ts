// Times one speech stage on its own, with no model turn beside it, and appends one JSON line per
// sample. Speech-to-text hears each caller line in real time; text-to-speech speaks fixed replies.
// Usage: stages.ts --out <file> (--stt zipformer|moonshine|whisper | --tts piper|kokoro)
//   [--rounds 3] [--silence-ms 500]
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { lines, loadCallerLine } from './caller.ts';
import { listenToCaller } from './listen.ts';
import type { SpeechToTextName, TextToSpeechName } from './speech.ts';
import { createSpeechToText, createTextToSpeech, createVad, threads } from './speech.ts';

// Sentences in the shape of nixie's spoken replies: an acknowledgement, then short answer lines.
const replies = [
    'Sure, let me think.',
    'Good question.',
    'Pack a warm layer, a rain jacket, and a torch with spare batteries.',
    'The light travels through more air at sunset, so the blue scatters away and the reds remain.',
    'Try a quick vegetable stir fry with rice and a splash of soy sauce.',
    'Water it about once every two weeks in summer, and much less in winter.',
  ],
  out = readFlag('--out') ?? 'results/stages.jsonl',
  rounds = Number(readFlag('--rounds') ?? 3),
  silenceMs = Number(readFlag('--silence-ms') ?? 500);

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

mkdirSync(dirname(out), { recursive: true });
const sttName = readFlag('--stt') as SpeechToTextName | undefined,
  ttsName = readFlag('--tts') as TextToSpeechName | undefined;
if (sttName) {
  await runSpeechToText(sttName);
} else if (ttsName) {
  await runTextToSpeech(ttsName);
} else {
  throw new Error('pass --stt or --tts');
}

async function runSpeechToText(name: SpeechToTextName): Promise<void> {
  const stt = createSpeechToText(name),
    vad = createVad(silenceMs);
  for (let round = 0; round < rounds; round++) {
    for (const [index, text] of lines.entries()) {
      const line = await loadCallerLine(index),
        heard = await listenToCaller(line.audio, line.speechEndSample, stt.start(), vad);
      appendFileSync(
        out,
        `${JSON.stringify({
          endpointMs: heard.vadEndAt - heard.speechEndAt,
          line: index,
          round,
          silenceMs,
          stage: 'stt',
          stt: name,
          sttMs: heard.transcriptAt - heard.vadEndAt,
          threads,
          transcript: heard.transcript,
          wordErrors: countWordErrors(text, heard.transcript),
          words: splitWords(text).length,
        })}\n`,
      );
    }
  }
}

async function runTextToSpeech(name: TextToSpeechName): Promise<void> {
  const tts = createTextToSpeech(name);
  // One untimed sentence warms the session, as a call would before its first reply.
  await tts.speak('Hello.');
  for (let round = 0; round < rounds; round++) {
    for (const [index, text] of replies.entries()) {
      const spoken = await tts.speak(text),
        audioMs = (spoken.samples.length / spoken.sampleRate) * 1000;
      appendFileSync(
        out,
        `${JSON.stringify({
          audioMs,
          firstChunkMs: spoken.firstChunkMs,
          line: index,
          round,
          rtf: spoken.totalMs / audioMs,
          stage: 'tts',
          threads,
          totalMs: spoken.totalMs,
          tts: name,
          words: splitWords(text).length,
        })}\n`,
      );
    }
  }
}

function splitWords(text: string): string[] {
  return text
    .toLowerCase()
    .replaceAll(/[^a-z0-9' ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Word-level edit distance between the line and the transcript.
export function countWordErrors(reference: string, heard: string): number {
  const ref = splitWords(reference),
    hyp = splitWords(heard);
  let previous = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (const [i, word] of ref.entries()) {
    const current = [i + 1];
    for (const [j, other] of hyp.entries()) {
      current.push(
        Math.min(
          (previous[j + 1] ?? 0) + 1,
          (current[j] ?? 0) + 1,
          (previous[j] ?? 0) + (word === other ? 0 : 1),
        ),
      );
    }
    previous = current;
  }
  return previous[hyp.length] ?? 0;
}
