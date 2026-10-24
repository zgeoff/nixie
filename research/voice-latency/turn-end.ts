// Plays each utterance of a speech set in real time, 32 ms at a time, through Silero voice activity
// detection. At each pause of 200 ms or more it asks every detector at once and records each answer
// with the time it arrived, counted from the end of the speech before the pause. The text detectors
// read a Moonshine transcript of the audio heard so far, and their answer time includes it.
// report-turn-end.ts replays the candidates over these records.
// Usage: turn-end.ts --set <name> [--out <file>] [--detectors smartTurn,clef,jev] [--limit <n>]
//   [--replace]
// Clef-flash reads CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, and Jev reads TYPESAFE_API_KEY.
// A token may be empty where a broker adds it to each request.
import { closeSync, mkdirSync, openSync, readdirSync, rmSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { createDecisionModel } from './create-decision-model.ts';
import { createSmartTurn } from './create-smart-turn.ts';
import type { DetectorName } from './find-turn-end.ts';
import { playUtterance } from './play-utterance.ts';
import { speechSetDir } from './speech-sets.ts';
import { createSpeechToText, createVad, sampleRate } from './speech.ts';
import { toPlainTranscript } from './to-plain-transcript.ts';
import type { TurnEndRecord } from './turn-end-record.ts';

const { values } = parseArgs({
  options: {
    detectors: { default: 'smartTurn,clef,jev', type: 'string' },
    limit: { type: 'string' },
    out: { type: 'string' },
    replace: { default: false, type: 'boolean' },
    set: { default: 'ami', type: 'string' },
  },
});
const set = values.set;
const out = values.out ?? `results/turn-end-${set}.jsonl`;
mkdirSync(dirname(out), { recursive: true });
if (values.replace) {
  rmSync(out, { force: true });
}
// The runner writes one line per utterance from the first, so a second run into the same file
// would count each utterance it repeats twice. Creating the file exclusively reserves it for this
// run in one step, so two runners never both find it free.
const outFile = reserveOutput(out);
const detectors = z.array(z.enum(['smartTurn', 'clef', 'jev'])).parse(values.detectors.split(','));
const limit =
  values.limit === undefined ? Number.POSITIVE_INFINITY : z.coerce.number().int().positive().parse(values.limit);
const pauseMs = 200;

const smartTurn = await createSmartTurn();
const clef = createDecisionModel('clef', {
  accountID: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
  token: process.env.CLOUDFLARE_API_TOKEN ?? '',
  transport: fetch,
});
const jev = createDecisionModel('jev', { token: process.env.TYPESAFE_API_KEY ?? '', transport: fetch });
// The streaming Zipformer's text at the pause came back empty on most telephone and meeting clips,
// where Moonshine read them well, so the text detectors read Moonshine.
const moonshine = createSpeechToText('moonshine');
const vad = createVad(pauseMs);
const dir = speechSetDir(set);
const count = Math.min(limit, readdirSync(dir).filter((name) => name.endsWith('.json')).length);
const models = new Map<DetectorName, string>([['smartTurn', 'smart-turn-v3.2-cpu']]);

// The first feature build and inference run several times slower than the rest.
await smartTurn.readEndProbability(new Float32Array(sampleRate));

for (let index = 0; index < count; index++) {
  const meta = z.object({ id: z.string() }).parse(await Bun.file(join(dir, `${index}.json`)).json());
  const speech = new Float32Array(await Bun.file(join(dir, `${index}.f32`)).arrayBuffer());
  const pauses = await playUtterance(speech, {
    askDetector,
    clock: {
      now: () => performance.now(),
      sleepUntil: (ms) => Bun.sleep(Math.max(0, ms - performance.now())),
    },
    detectors,
    readTranscript,
    vad,
  });
  const record: TurnEndRecord = {
    detectors,
    durationMs: Math.round((speech.length * 1000) / sampleRate),
    id: meta.id,
    index,
    models: Object.fromEntries(models),
    pauses,
    set,
  };
  writeSync(outFile, `${JSON.stringify(record)}\n`);
  console.log(`${set} ${index + 1}/${count}: ${pauses.length} pauses`);
}
closeSync(outFile);

function reserveOutput(path: string): number {
  try {
    return openSync(path, 'wx');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      console.error(`${path} already holds a run; pass --replace to start it again`);
      process.exit(1);
    }
    throw error;
  }
}

async function readTranscript(heard: Float32Array): Promise<string> {
  const recognizer = moonshine.start();
  recognizer.accept(heard);
  return toPlainTranscript(await recognizer.finish());
}

function askDetector(
  detector: DetectorName,
  heard: Float32Array,
  transcript: Promise<string>,
): Promise<{ probability: number; usage?: Record<string, unknown> | undefined }> {
  return match(detector)
    .with('smartTurn', async () => ({ probability: await smartTurn.readEndProbability(heard) }))
    .with('clef', 'jev', async (name) => {
      const answer = await (name === 'clef' ? clef : jev).readEndProbability(await transcript);
      models.set(name, answer.model);
      return { probability: answer.probability, usage: answer.usage };
    })
    .exhaustive();
}
