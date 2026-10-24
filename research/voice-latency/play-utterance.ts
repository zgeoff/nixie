import type { Answer, DetectorName, Pause } from './find-turn-end.ts';
import { sampleRate } from './speech.ts';

export type RecordedAnswer = Answer | (Answer & { usage: Record<string, unknown> });

export interface UtterancePlayer {
  // Returns a detector's probability that the turn has ended, given the audio heard so far and the
  // transcript of it.
  askDetector: (
    detector: DetectorName,
    heard: Float32Array,
    transcript: Promise<string>,
  ) => Promise<{ probability: number; usage?: Record<string, unknown> | undefined }>;
  clock: { now: () => number; sleepUntil: (ms: number) => Promise<void> };
  detectors: DetectorName[];
  readTranscript: (heard: Float32Array) => Promise<string>;
  vad: {
    accept: (samples: Float32Array) => void;
    readSegments: () => { end: number; start: number }[];
    reset: () => void;
  };
}

const windowSamples = 512;
const windowMs = (windowSamples * 1000) / sampleRate;
// The detectors need silence after the last word to see the final pause and wait it out.
const tailSamples = sampleRate * 2;

// Plays one utterance in real time, a window at a time, and asks every detector at each segment the
// voice activity detector closes. Each answer records its time from the end of the speech before
// the pause.
export async function playUtterance(
  speech: Float32Array,
  player: UtterancePlayer,
): Promise<(Pause & { answers: Partial<Record<DetectorName, RecordedAnswer>>; transcript: string })[]> {
  const audio = new Float32Array(speech.length + tailSamples);
  audio.set(speech);
  // A microphone never records digital silence, and Silero holds on longer over zeros than over a
  // noise floor, so the tail is noise at about -54 dBFS from a fixed seed.
  let seed = 1;
  for (let index = speech.length; index < audio.length; index++) {
    seed = (seed * 48_271) % 2_147_483_647;
    audio[index] = (seed / 1_073_741_823.5 - 1) * 0.002;
  }
  player.vad.reset();
  const segments: { end: number; start: number }[] = [];
  const asks: Promise<[number, DetectorName, RecordedAnswer]>[] = [];
  const transcripts: Promise<string>[] = [];
  const startedAt = player.clock.now();
  for (let offset = 0, frame = 0; offset < audio.length; offset += windowSamples, frame++) {
    // A microphone hands over a window only once its last sample is spoken.
    await player.clock.sleepUntil(startedAt + (frame + 1) * windowMs);
    player.vad.accept(audio.subarray(offset, offset + windowSamples));
    for (const segment of player.vad.readSegments()) {
      const pauseIndex = segments.length;
      const speechEndMs = (segment.end * 1000) / sampleRate;
      const heard = audio.slice(0, offset + windowSamples);
      const transcript = player.detectors.some((detector) => detector !== 'smartTurn')
        ? player.readTranscript(heard)
        : Promise.resolve('');
      segments.push(segment);
      transcripts.push(transcript);
      for (const detector of player.detectors) {
        asks.push(
          player.askDetector(detector, heard, transcript).then(
            ({ probability, usage }): [number, DetectorName, RecordedAnswer] => [
              pauseIndex,
              detector,
              {
                answeredAfterMs: Math.round(player.clock.now() - startedAt - speechEndMs),
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
  // A failed transcript already shows as each text detector's error, so the record keeps no text.
  const heardTranscripts = await Promise.all(transcripts.map((transcript) => transcript.catch(() => '')));
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
