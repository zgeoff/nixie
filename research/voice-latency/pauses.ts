// Plays whole utterances through the detector at each pause setting and counts the utterances it
// would end early: a turn ends at the first segment, so an utterance that yields 2 or more segments
// cuts the caller off. Appends one JSON line per utterance and pause.
// Usage: pauses.ts --out <file> [--set real|caller] [--pauses 300,400,500]
import { appendFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { callerDir, lines } from './caller.ts';
import { classifyUtterance } from './classify-utterance.ts';
import { realSpeechDir } from './real-speech.ts';
import { createVad } from './speech.ts';

const { values } = parseArgs({
  options: {
    out: { default: 'results/pauses.jsonl', type: 'string' },
    pauses: { default: '300,400,500', type: 'string' },
    set: { default: 'real', type: 'string' },
  },
});
const out = values.out;
const set = z.enum(['caller', 'real']).parse(values.set);
const pauses = z.array(z.coerce.number().int().positive()).parse(values.pauses.split(','));

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
    const utterance = classifyUtterance(vad, speech);
    if (utterance.cutOff) {
      cutBy.get(silenceMs)?.add(index);
    }
    if (utterance.heardShare !== undefined) {
      heardShares.get(silenceMs)?.push(utterance.heardShare);
    }
    appendFileSync(
      out,
      `${JSON.stringify({
        ...utterance,
        index,
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
