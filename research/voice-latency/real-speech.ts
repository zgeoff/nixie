// Downloads real conversational utterances from the AMI meeting corpus's test split (CC BY 4.0,
// headset microphones) into results/real-speech/, for the pause test in pauses.ts. It keeps
// utterances of at least 8 words, the length of a spoken request, from pages spread across the split.
// Usage: real-speech.ts [--pages 40] [--per-page 5]
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sampleRate } from './speech.ts';

export const realSpeechDir = join(import.meta.dir, 'results', 'real-speech');
const rowsURL = 'https://datasets-server.huggingface.co/rows?dataset=edinburghcstr/ami&config=ihm&split=test';
const splitRows = 12_643;
const minWords = 8;
const pages = Number(readFlag('--pages') ?? 40);
const perPage = Number(readFlag('--per-page') ?? 5);

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

interface AMIRow {
  audio: { src: string }[];
  audio_id: string;
  speaker_id: string;
  text: string;
}

if (import.meta.main) {
  // The download fills a staging folder and replaces the corpus only once it completes, so the pause
  // test never reads utterances left over from an earlier, larger download.
  const stagingDir = `${realSpeechDir}.partial`;
  rmSync(stagingDir, { force: true, recursive: true });
  mkdirSync(stagingDir, { recursive: true });
  let kept = 0;
  for (let page = 0; page < pages; page++) {
    const offset = Math.floor((page * splitRows) / pages);
    const rows = await readRows(offset);
    const picked = rows.filter((row) => row.text.split(/\s+/).length >= minWords).slice(0, perPage);
    for (const row of picked) {
      const src = row.audio[0]?.src;
      if (!src) {
        continue;
      }
      const response = await readWithRetry(src);
      if (!response.ok) {
        throw new Error(`audio ${row.audio_id}: HTTP ${response.status}`);
      }
      const audio = parseWav(new Uint8Array(await response.arrayBuffer()));
      writeFileSync(join(stagingDir, `${kept}.f32`), audio);
      writeFileSync(
        join(stagingDir, `${kept}.json`),
        JSON.stringify({ id: row.audio_id, speaker: row.speaker_id, text: row.text }),
      );
      kept++;
    }
  }
  rmSync(realSpeechDir, { force: true, recursive: true });
  renameSync(stagingDir, realSpeechDir);
  console.log(`wrote ${kept} utterances to ${realSpeechDir}`);
}

async function readRows(offset: number): Promise<AMIRow[]> {
  const response = await readWithRetry(`${rowsURL}&offset=${offset}&length=100`);
  if (!response.ok) {
    throw new Error(`rows at ${offset}: HTTP ${response.status}`);
  }
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('rows' in body) || !Array.isArray(body.rows)) {
    throw new Error(`rows at ${offset}: no rows in the response`);
  }
  return body.rows.flatMap((entry: unknown) =>
    typeof entry === 'object' && entry !== null && 'row' in entry && isAMIRow(entry.row) ? [entry.row] : [],
  );
}

// The dataset server answers 429 to a burst of requests, so each request waits and tries again.
export async function readWithRetry(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url);
    if (response.status !== 429 || attempt === 6) {
      return response;
    }
    await Bun.sleep(attempt * 5000);
  }
}

function isAMIRow(value: unknown): value is AMIRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'audio' in value &&
    Array.isArray(value.audio) &&
    'audio_id' in value &&
    'text' in value &&
    typeof value.text === 'string'
  );
}

// Reads mono 32-bit float audio at 16 kHz, the format the dataset server returns for this corpus.
function parseWav(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format: { bits: number; channels: number; encoding: number; rate: number } | undefined;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = new TextDecoder().decode(bytes.subarray(at, at + 4));
    const size = view.getUint32(at + 4, true);
    if (id === 'fmt ') {
      format = {
        bits: view.getUint16(at + 22, true),
        channels: view.getUint16(at + 10, true),
        encoding: view.getUint16(at + 8, true),
        rate: view.getUint32(at + 12, true),
      };
    } else if (id === 'data') {
      // Encoding 3 is IEEE float in the WAV format.
      if (format?.encoding !== 3 || format.bits !== 32 || format.channels !== 1 || format.rate !== sampleRate) {
        throw new Error(`unexpected WAV format ${JSON.stringify(format)}`);
      }
      const samples = new Float32Array(Math.floor(size / 4));
      for (const index of samples.keys()) {
        samples[index] = view.getFloat32(at + 8 + index * 4, true);
      }
      return samples;
    }
    at += 8 + size + (size % 2);
  }
  throw new Error('the WAV file holds no data chunk');
}
