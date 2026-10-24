// Plays each utterance of a speech set in real time, 32 ms at a time, through Silero voice activity
// detection. At each pause of 200 ms or more it asks every detector at once and records each answer
// with the time it arrived, counted from the end of the speech before the pause. The text detectors
// read a Moonshine transcript of the audio heard so far, and their answer time includes it.
// report-turn-end.ts replays the candidates over these records.
// Usage: turn-end.ts --set <name> [--out <file>] [--detectors smartTurn,clef,jev] [--limit <n>]
//   [--replace]
// Clef-flash reads CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, and Jev reads TYPESAFE_API_KEY.
// A token may be empty where a broker adds it to each request.
import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { createDecisionModel } from './create-decision-model.ts';
import { createSmartTurn } from './create-smart-turn.ts';
import type { Answer, DetectorName, Pause } from './find-turn-end.ts';
import { speechSetDir } from './speech-sets.ts';
import { createSpeechToText, createVad, sampleRate } from './speech.ts';
import { toPlainTranscript } from './to-plain-transcript.ts';

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
// The runner appends one line per utterance from the first, so a second run into the same file
// would count each utterance it repeats twice.
if (existsSync(out) && !values.replace) {
  console.error(`${out} already holds a run; pass --replace to start it again`);
  process.exit(1);
}
rmSync(out, { force: true });
const detectors = z.array(z.enum(['smartTurn', 'clef', 'jev'])).parse(values.detectors.split(','));
const limit =
  values.limit === undefined ? Number.POSITIVE_INFINITY : z.coerce.number().int().positive().parse(values.limit);
const pauseMs = 200;
const windowSamples = 512;
const windowMs = (windowSamples * 1000) / sampleRate;
// The detectors need silence after the last word to see the final pause and wait it out.
const tailSamples = sampleRate * 2;

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

mkdirSync(dirname(out), { recursive: true });
for (let index = 0; index < count; index++) {
  const meta = z.object({ id: z.string() }).parse(await Bun.file(join(dir, `${index}.json`)).json());
  const speech = new Float32Array(await Bun.file(join(dir, `${index}.f32`)).arrayBuffer());
  const pauses = await playUtterance(speech);
  appendFileSync(
    out,
    `${JSON.stringify({
      detectors,
      durationMs: Math.round((speech.length * 1000) / sampleRate),
      id: meta.id,
      index,
      models: Object.fromEntries(models),
      pauses,
      set,
    })}\n`,
  );
  console.log(`${set} ${index + 1}/${count}: ${pauses.length} pauses`);
}

async function playUtterance(speech: Float32Array): Promise<(Pause & { transcript: string })[]> {
  const audio = new Float32Array(speech.length + tailSamples);
  audio.set(speech);
  // A microphone never records digital silence, and Silero holds on longer over zeros than over a
  // noise floor, so the tail is noise at about -54 dBFS from a fixed seed.
  let seed = 1;
  for (let index = speech.length; index < audio.length; index++) {
    seed = (seed * 48_271) % 2_147_483_647;
    audio[index] = (seed / 1_073_741_823.5 - 1) * 0.002;
  }
  vad.reset();
  const segments: { end: number; start: number }[] = [];
  const asks: Promise<[number, DetectorName, RecordedAnswer]>[] = [];
  const transcripts: Promise<string>[] = [];
  const startedAt = performance.now();
  for (let offset = 0, frame = 0; offset < audio.length; offset += windowSamples, frame++) {
    // A microphone hands over a window only once its last sample is spoken.
    await Bun.sleep(Math.max(0, startedAt + (frame + 1) * windowMs - performance.now()));
    vad.accept(audio.subarray(offset, offset + windowSamples));
    for (const segment of vad.readSegments()) {
      const pauseIndex = segments.length;
      const speechEndMs = (segment.end * 1000) / sampleRate;
      const heard = audio.slice(0, offset + windowSamples);
      const transcript = detectors.some((detector) => detector !== 'smartTurn')
        ? readTranscript(heard)
        : Promise.resolve('');
      segments.push(segment);
      transcripts.push(transcript);
      for (const detector of detectors) {
        asks.push(
          askDetector(detector, heard, transcript).then(
            ({ probability, usage }): [number, DetectorName, RecordedAnswer] => [
              pauseIndex,
              detector,
              {
                answeredAfterMs: Math.round(performance.now() - startedAt - speechEndMs),
                probability,
                ...(usage === undefined ? {} : { usage }),
              },
            ],
            (error: unknown): [number, DetectorName, RecordedAnswer] => [pauseIndex, detector, { error: String(error) }],
          ),
        );
      }
    }
  }
  const settled = await Promise.all(asks);
  const heardTranscripts = await Promise.all(transcripts);
  const pauses = segments.map((segment, pauseIndex) => {
    const answers: Partial<Record<DetectorName, RecordedAnswer>> = {};
    const next = segments[pauseIndex + 1];
    return {
      answers,
      resumeMs: next === undefined ? undefined : (next.start * 1000) / sampleRate,
      speechEndMs: (segment.end * 1000) / sampleRate,
      transcript: heardTranscripts[pauseIndex] ?? '',
    };
  });
  for (const [pauseIndex, detector, answer] of settled) {
    const pause = pauses[pauseIndex];
    if (pause !== undefined) {
      pause.answers[detector] = answer;
    }
  }
  return pauses;
}

type RecordedAnswer = Answer | (Answer & { usage: Record<string, unknown> });

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
