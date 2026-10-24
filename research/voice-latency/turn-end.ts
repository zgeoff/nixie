// Plays each utterance of a speech set in real time, 32 ms at a time, through Silero voice activity
// detection and the streaming Zipformer. At each pause of 200 ms or more it asks every detector at
// once and records each answer with the time it arrived, counted from the end of the speech before
// the pause. report-turn-end.ts replays the candidates over these records.
// Usage: turn-end.ts --set <name> --out <file> [--detectors smartTurn,clef,jev] [--limit <n>]
// Clef-flash reads CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, and Jev reads TYPESAFE_API_KEY.
// A token may be empty where a broker adds it to each request.
import { appendFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { createDecisionModel } from './create-decision-model.ts';
import { createSmartTurn } from './create-smart-turn.ts';
import type { Answer, DetectorName, Pause } from './find-turn-end.ts';
import { speechSetDir } from './speech-sets.ts';
import { createStreamingRecognizer, createVad, sampleRate } from './speech.ts';

const set = readFlag('--set') ?? 'ami';
const out = readFlag('--out') ?? `results/turn-end-${set}.jsonl`;
const detectors = (readFlag('--detectors') ?? 'smartTurn,clef,jev').split(',').filter(isDetectorName);
const limit = Number(readFlag('--limit') ?? Number.POSITIVE_INFINITY);
const pauseMs = 200;
const windowSamples = 512;
const windowMs = (windowSamples * 1000) / sampleRate;
// The detectors need silence after the last word to see the final pause and wait it out.
const tailSamples = sampleRate * 2;

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function isDetectorName(value: string): value is DetectorName {
  return value === 'smartTurn' || value === 'clef' || value === 'jev';
}

const smartTurn = await createSmartTurn();
const clef = createDecisionModel('clef', {
  accountID: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
  token: process.env.CLOUDFLARE_API_TOKEN ?? '',
});
const jev = createDecisionModel('jev', { token: process.env.TYPESAFE_API_KEY ?? '' });
const recognizer = createStreamingRecognizer();
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
  const stream = recognizer.start();
  const segments: { end: number; start: number }[] = [];
  const asks: Promise<[number, DetectorName, Answer]>[] = [];
  const transcripts: string[] = [];
  const startedAt = performance.now();
  for (let offset = 0, frame = 0; offset < audio.length; offset += windowSamples, frame++) {
    await Bun.sleep(Math.max(0, startedAt + frame * windowMs - performance.now()));
    const window = audio.subarray(offset, offset + windowSamples);
    vad.accept(window);
    stream.accept(window);
    for (const segment of vad.readSegments()) {
      const pauseIndex = segments.length;
      const speechEndMs = (segment.end * 1000) / sampleRate;
      const heard = audio.slice(0, offset + windowSamples);
      const transcript = stream.readPartial();
      segments.push(segment);
      transcripts.push(transcript);
      for (const detector of detectors) {
        asks.push(
          askDetector(detector, heard, transcript).then(
            (probability): [number, DetectorName, Answer] => [
              pauseIndex,
              detector,
              { answeredAfterMs: Math.round(performance.now() - startedAt - speechEndMs), probability },
            ],
            (error: unknown): [number, DetectorName, Answer] => [pauseIndex, detector, { error: String(error) }],
          ),
        );
      }
    }
  }
  const pauses = segments.map((segment, pauseIndex) => {
    const answers: Partial<Record<DetectorName, Answer>> = {};
    const next = segments[pauseIndex + 1];
    return {
      answers,
      resumeMs: next === undefined ? undefined : (next.start * 1000) / sampleRate,
      speechEndMs: (segment.end * 1000) / sampleRate,
      transcript: transcripts[pauseIndex] ?? '',
    };
  });
  for (const [pauseIndex, detector, answer] of await Promise.all(asks)) {
    const pause = pauses[pauseIndex];
    if (pause !== undefined) {
      pause.answers[detector] = answer;
    }
  }
  return pauses;
}

function askDetector(detector: DetectorName, heard: Float32Array, transcript: string): Promise<number> {
  return match(detector)
    .with('smartTurn', () => smartTurn.readEndProbability(heard))
    .with('clef', 'jev', async (name) => {
      const answer = await (name === 'clef' ? clef : jev).readEndProbability(transcript);
      models.set(name, answer.model);
      return answer.probability;
    })
    .exhaustive();
}
