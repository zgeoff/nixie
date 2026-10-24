// Downloads real speech for the end-of-turn test into the set's folder that speechSetDir names,
// from pages spread across each corpus's test split:
// - hvb: the caller's turns in Harper Valley Bank's simulated bank calls, from SLUE phase 2
//   (CC BY 4.0), with 6 or more words.
// - slurp: spoken commands to a home assistant from SLURP (audio CC BY-NC 4.0), with 4 or more
//   words, one recording per command.
// ffmpeg decodes each recording to 16 kHz mono float samples.
// Usage: download-speech-set.ts --set hvb|slurp [--pages 40] [--per-page 5]
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { readWithRetry } from './real-speech.ts';
import { speechSetDir } from './speech-sets.ts';
import type { SpeechUtterance } from './speech-utterance.ts';
import { sampleRate } from './speech.ts';

export type SpeechSetName = 'hvb' | 'slurp';

// Keeps up to perPage eligible utterances from each page, never the same utterance twice, and
// replaces the target folder only once every page is in. Returns the number kept.
export async function downloadSpeechSet(options: {
  decode: (encoded: Uint8Array) => Promise<Uint8Array>;
  pages: number;
  perPage: number;
  set: SpeechSetName;
  targetDir: string;
  transport: typeof fetch;
}): Promise<number> {
  const source = pickSource(options.set);
  // Each download stages into a folder of its own, so two downloads of one set never write into
  // the same folder, and the target always holds one whole download.
  mkdirSync(dirname(options.targetDir), { recursive: true });
  const stagingDir = mkdtempSync(`${options.targetDir}.partial-`);
  const seen = new Set<string>();
  let kept = 0;
  for (let page = 0; page < options.pages; page++) {
    const offset = Math.floor((page * source.rows) / options.pages);
    const response = await readWithRetry(`${source.url}&offset=${offset}&length=100`, options.transport);
    if (!response.ok) {
      throw new Error(`rows at ${offset}: HTTP ${response.status}`);
    }
    const body = z.object({ rows: z.array(z.object({ row: z.unknown() })) }).parse(await response.json());
    const picked = body.rows
      .flatMap(({ row }) => source.pick(row) ?? [])
      .filter((utterance) => !seen.has(utterance.id) && seen.add(utterance.id))
      .slice(0, options.perPage);
    for (const utterance of picked) {
      const audio = await readWithRetry(utterance.src, options.transport);
      if (!audio.ok) {
        throw new Error(`audio ${utterance.id}: HTTP ${audio.status}`);
      }
      writeFileSync(join(stagingDir, `${kept}.f32`), await options.decode(new Uint8Array(await audio.arrayBuffer())));
      const meta: SpeechUtterance = { id: utterance.id, text: utterance.text };
      writeFileSync(join(stagingDir, `${kept}.json`), JSON.stringify(meta));
      kept++;
    }
  }
  rmSync(options.targetDir, { force: true, recursive: true });
  renameSync(stagingDir, options.targetDir);
  return kept;
}

interface Utterance {
  id: string;
  src: string;
  text: string;
}

const audioField = z.array(z.object({ src: z.string() }));
const hvbRow = z.object({
  audio: audioField,
  issue_id: z.string(),
  role: z.string(),
  text: z.string(),
  utt_index: z.number(),
});
const slurpRow = z.object({ audio: audioField, id: z.number(), transcript: z.string() });

function pickSource(set: SpeechSetName): {
  pick: (row: unknown) => Utterance | undefined;
  rows: number;
  url: string;
} {
  return match(set)
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
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

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

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      pages: { default: '40', type: 'string' },
      'per-page': { default: '5', type: 'string' },
      set: { type: 'string' },
    },
  });
  const set = z.enum(['hvb', 'slurp']).parse(values.set);
  const targetDir = speechSetDir(set);
  const kept = await downloadSpeechSet({
    decode: (encoded) => decodeAudio(encoded, Bun.spawn),
    pages: z.coerce.number().int().positive().parse(values.pages),
    perPage: z.coerce.number().int().positive().parse(values['per-page']),
    set,
    targetDir,
    transport: fetch,
  });
  console.log(`wrote ${kept} utterances to ${targetDir}`);
}
