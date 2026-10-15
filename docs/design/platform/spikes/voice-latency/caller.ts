// Speaks the caller's lines with Piper's ryan voice, at 16 kHz with 1.5 s of silence after the
// speech, into results/caller/. Each line is invented for the spike.
// Usage: caller.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTextToSpeech, sampleRate, toSampleRate } from './speech.ts';

export const callerDir = join(import.meta.dir, 'results', 'caller'),
  // Each line asks for an answer of 2 or 3 sentences, as a spoken question would.
  lines = [
    'What should I pack for a weekend of camping by a lake?',
    'How long does it take to boil an egg so the yolk stays soft?',
    'Can you explain why the sky looks orange at sunset?',
    'Give me a quick idea for a vegetarian dinner tonight.',
    'What is a good way to remember a long shopping list?',
    'How do I get a stubborn jar lid to open?',
    'Why do cats like to sit in cardboard boxes?',
    'What is the difference between a lake and a pond?',
    'Suggest a short stretch I can do at my desk.',
    'How often should I water a cactus on a sunny windowsill?',
  ],
  // The caller says this over nixie's reply to cut it off.
  bargeIn = 'Hang on, stop there.',
  // A line that draws a long reply, so the barge-in lands while nixie still speaks.
  longLine = 'Tell me the story of how bread was first made, in a few sentences.';

const tailSeconds = 1.5;

export interface CallerLine {
  audio: Float32Array;
  speechEndSample: number;
  text: string;
}

if (import.meta.main) {
  mkdirSync(callerDir, { recursive: true });
  const voice = createTextToSpeech('caller'),
    all = [...lines, bargeIn, longLine];
  for (const [index, text] of all.entries()) {
    const spoken = await voice.speak(text),
      speech = trimSilence(toSampleRate(spoken.samples, spoken.sampleRate)),
      audio = new Float32Array(speech.length + sampleRate * tailSeconds);
    audio.set(speech);
    writeFileSync(join(callerDir, `${index}.f32`), audio);
    writeFileSync(
      join(callerDir, `${index}.json`),
      JSON.stringify({ speechEndSample: speech.length, text }),
    );
  }
  console.log(`wrote ${all.length} lines to ${callerDir}`);
}

// Cuts the silence Piper leaves before and after the speech, so the end of speech is exact.
function trimSilence(samples: Float32Array): Float32Array {
  const threshold = 0.01;
  let start = 0,
    end = samples.length;
  while (start < end && Math.abs(samples[start] ?? 0) < threshold) {
    start++;
  }
  while (end > start && Math.abs(samples[end - 1] ?? 0) < threshold) {
    end--;
  }
  return samples.slice(start, end);
}

export async function loadCallerLine(index: number): Promise<CallerLine> {
  const meta = (await Bun.file(join(callerDir, `${index}.json`)).json()) as {
      speechEndSample: number;
      text: string;
    },
    bytes = await Bun.file(join(callerDir, `${index}.f32`)).arrayBuffer();
  return { audio: new Float32Array(bytes), ...meta };
}
