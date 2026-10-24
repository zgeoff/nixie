// Builds the owner's blind listening set from one round of the reply runs: every caller line in
// each candidate's voice, named by line and by a letter that hides the candidate. The answer key
// goes in a file of its own, and a labelled copy beside it is for listening after the ranking.
// Usage: build-listening-set.ts --results <dir> --out <dir> --candidates <a,b,...> [--round 0] [--seed <n>]
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { lines, toolLineStart, toolLines } from './caller.ts';
import { pickBlindLetters } from './pick-blind-letters.ts';
import { toRecordingsDir } from './to-recordings-dir.ts';

const { values } = parseArgs({
  options: {
    candidates: { type: 'string' },
    out: { type: 'string' },
    results: { type: 'string' },
    round: { default: '0', type: 'string' },
    seed: { default: String(Date.now()), type: 'string' },
  },
});
const results = z.string().min(1).parse(values.results);
const out = z.string().min(1).parse(values.out);
const candidates = z.string().min(1).parse(values.candidates).split(',');
const round = z.coerce.number().int().nonnegative().parse(values.round);
const seed = z.coerce.number().int().parse(values.seed);
if (existsSync(out)) {
  console.error(`${out} already exists; remove it to build the set again`);
  process.exit(1);
}

const letters = pickBlindLetters(candidates, seed);
const callerLines = [
  ...lines.map((text, index) => ({ index, text })),
  ...toolLines.map((text, index) => ({ index: toolLineStart + index, text })),
];
mkdirSync(join(out, 'blind'), { recursive: true });
for (const [lineNumber, line] of callerLines.entries()) {
  for (const candidate of candidates) {
    const source = join(toRecordingsDir(join(results, `reply-${candidate}.jsonl`)), `r${round}-l${line.index}.wav`);
    const name = `line-${String(lineNumber + 1).padStart(2, '0')}`;
    copyFileSync(source, join(out, 'blind', `${name}-${letters.get(candidate)}.wav`));
    mkdirSync(join(out, 'labelled', candidate), { recursive: true });
    copyFileSync(source, join(out, 'labelled', candidate, `${name}.wav`));
  }
}
writeFileSync(
  join(out, 'answer-key.json'),
  `${JSON.stringify({ letters: Object.fromEntries(letters), round, seed }, undefined, 2)}\n`,
);
writeFileSync(
  join(out, 'lines.txt'),
  `${callerLines.map((line, lineNumber) => `line-${String(lineNumber + 1).padStart(2, '0')}: ${line.text}`).join('\n')}\n`,
);
console.log(`wrote ${callerLines.length * candidates.length} clips to ${join(out, 'blind')}`);
