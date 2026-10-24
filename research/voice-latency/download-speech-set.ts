// Downloads real speech for the end-of-turn test into the set's folder that speechSetDir names,
// from pages spread across each corpus's test split:
// - hvb: the caller's turns in Harper Valley Bank's simulated bank calls, from SLUE phase 2
//   (CC BY 4.0), with 6 or more words.
// - slurp: spoken commands to a home assistant from SLURP (audio CC BY-NC 4.0), with 4 or more
//   words, one recording per command.
// ffmpeg decodes each recording to 16 kHz mono float samples.
// Usage: download-speech-set.ts --set hvb|slurp [--pages 40] [--per-page 5]
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { readWithRetry } from './real-speech.ts';
import { speechSetDir } from './speech-sets.ts';
import { sampleRate } from './speech.ts';

const { values } = parseArgs({
  options: {
    pages: { default: '40', type: 'string' },
    'per-page': { default: '5', type: 'string' },
    set: { type: 'string' },
  },
});
const set = z.enum(['hvb', 'slurp']).parse(values.set);
const pages = z.coerce.number().int().positive().parse(values.pages);
const perPage = z.coerce.number().int().positive().parse(values['per-page']);

interface Utterance {
  id: string;
  src: string;
  text: string;
}

const source = match(set)
  .with('hvb', () => ({
    pick: (row: unknown): Utterance | undefined => {
      const parsed = hvbRow.safeParse(row);
      return parsed.success && parsed.data.role === 'caller' && countWords(parsed.data.text) >= 6
        ? {
            id: `${parsed.data.issue_id}-${parsed.data.utt_index}`,
            src: parsed.data.audio[0]?.src ?? '',
            text: parsed.data.text,
          }
        : undefined;
    },
    rows: 6121,
    url: 'https://datasets-server.huggingface.co/rows?dataset=asapp/slue-phase-2&config=hvb&split=test',
  }))
  .with('slurp', () => ({
    pick: (row: unknown): Utterance | undefined => {
      const parsed = slurpRow.safeParse(row);
      return parsed.success && countWords(parsed.data.transcript) >= 4
        ? {
            id: String(parsed.data.id),
            src: parsed.data.audio[0]?.src ?? '',
            text: parsed.data.transcript,
          }
        : undefined;
    },
    rows: 13_078,
    url: 'https://datasets-server.huggingface.co/rows?dataset=marcel-gohsen/slurp&config=default&split=test',
  }))
  .exhaustive();

const audioField = z.array(z.object({ src: z.string() }));
const hvbRow = z.object({
  audio: audioField,
  issue_id: z.string(),
  role: z.string(),
  text: z.string(),
  utt_index: z.number(),
});
const slurpRow = z.object({ audio: audioField, id: z.number(), transcript: z.string() });

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

const targetDir = speechSetDir(set);
const stagingDir = `${targetDir}.partial`;
rmSync(stagingDir, { force: true, recursive: true });
mkdirSync(stagingDir, { recursive: true });
const seen = new Set<string>();
let kept = 0;
for (let page = 0; page < pages; page++) {
  const offset = Math.floor((page * source.rows) / pages);
  const response = await readWithRetry(`${source.url}&offset=${offset}&length=100`);
  if (!response.ok) {
    throw new Error(`rows at ${offset}: HTTP ${response.status}`);
  }
  const body = z.object({ rows: z.array(z.object({ row: z.unknown() })) }).parse(await response.json());
  const picked = body.rows
    .flatMap(({ row }) => source.pick(row) ?? [])
    .filter((utterance) => !seen.has(utterance.id) && seen.add(utterance.id))
    .slice(0, perPage);
  for (const utterance of picked) {
    const audio = await readWithRetry(utterance.src);
    if (!audio.ok) {
      throw new Error(`audio ${utterance.id}: HTTP ${audio.status}`);
    }
    writeFileSync(join(stagingDir, `${kept}.f32`), await decodeAudio(new Uint8Array(await audio.arrayBuffer()), Bun.spawn));
    writeFileSync(join(stagingDir, `${kept}.json`), JSON.stringify({ id: utterance.id, text: utterance.text }));
    kept++;
  }
}
rmSync(targetDir, { force: true, recursive: true });
renameSync(stagingDir, targetDir);
console.log(`wrote ${kept} utterances to ${targetDir}`);

async function decodeAudio(encoded: Uint8Array, spawn: typeof Bun.spawn): Promise<Uint8Array> {
  const ffmpeg = spawn(
    ['ffmpeg', '-loglevel', 'error', '-i', 'pipe:0', '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', 'pipe:1'],
    { stdin: encoded, stdout: 'pipe' },
  );
  const decoded = new Uint8Array(await new Response(ffmpeg.stdout).arrayBuffer());
  if ((await ffmpeg.exited) !== 0) {
    throw new Error('ffmpeg could not decode a recording');
  }
  return decoded;
}
