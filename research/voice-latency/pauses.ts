// Plays whole utterances through the detector at each pause setting and counts the utterances it
// would end early: a turn ends at the first segment, so an utterance that yields 2 or more segments
// cuts the caller off. Appends one JSON line per utterance and pause.
// Usage: pauses.ts --out <file> [--set real|caller] [--pauses 300,400,500]
import { appendFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { callerDir, lines } from './caller.ts';
import { realSpeechDir } from './real-speech.ts';
import { createVad, sampleRate } from './speech.ts';

const out = readFlag('--out') ?? 'results/pauses.jsonl';
const set = readFlag('--set') ?? 'real';
const pauses = (readFlag('--pauses') ?? '300,400,500').split(',').map(Number);
// The detector needs silence after the last word to close the final segment.
const tailSamples = sampleRate * 1.5;
const windowSamples = 512;

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

mkdirSync(dirname(out), { recursive: true });
const dir = set === 'caller' ? callerDir : realSpeechDir;
const count =
  set === 'caller' ? lines.length : readdirSync(dir).filter((name) => name.endsWith('.json')).length;
const cutBy = new Map<number, Set<number>>();
const heardShares = new Map<number, number[]>();
for (const silenceMs of pauses) {
  cutBy.set(silenceMs, new Set());
  heardShares.set(silenceMs, []);
  const vad = createVad(silenceMs);
  for (let index = 0; index < count; index++) {
    const meta = (await Bun.file(join(dir, `${index}.json`)).json()) as { text: string };
    const speech = new Float32Array(await Bun.file(join(dir, `${index}.f32`)).arrayBuffer());
    const audio = new Float32Array(speech.length + tailSamples);
    audio.set(speech);
    vad.reset();
    for (let offset = 0; offset < audio.length; offset += windowSamples) {
      vad.accept(audio.subarray(offset, offset + windowSamples));
    }
    const segments = vad.readSegments();
    const gapsMs = segments
      .slice(1)
      .map((segment, at) => ((segment.start - (segments[at]?.end ?? 0)) * 1000) / sampleRate);
    const first = segments[0];
    const last = segments.at(-1);
    if (first && last && segments.length > 1) {
      cutBy.get(silenceMs)?.add(index);
      // How much of the utterance, from its first speech to its last, came before the turn ended.
      heardShares.get(silenceMs)?.push((first.end - first.start) / (last.end - first.start));
    }
    appendFileSync(
      out,
      `${JSON.stringify({
        cutOff: segments.length > 1,
        firstEndMs: first ? (first.end * 1000) / sampleRate : undefined,
        gapsMs: gapsMs.map(Math.round),
        index,
        lastEndMs: last ? (last.end * 1000) / sampleRate : undefined,
        segments: segments.length,
        set,
        silenceMs,
        text: meta.text,
      })}\n`,
    );
  }
}

// The longest pause cuts off the fewest utterances, so each row also counts the utterances that the
// longest pause hears whole and this pause cuts off.
const longest = cutBy.get(Math.max(...pauses)) ?? new Set<number>();
console.log(`| Pause | Utterances | Cut off | Cut off only at this pause | Heard before the cut |`);
console.log('| --- | --- | --- | --- | --- |');
for (const silenceMs of pauses) {
  const cut = cutBy.get(silenceMs) ?? new Set<number>();
  const shares = (heardShares.get(silenceMs) ?? []).toSorted((a, b) => a - b);
  const median = shares[Math.floor(shares.length / 2)];
  console.log(
    `| ${silenceMs} ms | ${count} | ${cut.size} (${((cut.size / count) * 100).toFixed(1)}%) | ${
      [...cut].filter((index) => !longest.has(index)).length
    } | ${median === undefined ? '-' : `${(median * 100).toFixed(0)}%`} |`,
  );
}
