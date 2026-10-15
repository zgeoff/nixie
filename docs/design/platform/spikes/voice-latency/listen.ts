// Plays the caller's audio into voice activity detection and a recognizer in real time, 32 ms at
// a time, as a microphone would, and times the end of the turn.
import type { Recognizer } from './speech.ts';
import { createVad, sampleRate } from './speech.ts';

export interface Heard {
  // All times are performance.now() values.
  speechEndAt: number;
  transcript: string;
  transcriptAt: number;
  vadEndAt: number;
}

const windowSamples = 512,
  windowMs = (windowSamples / sampleRate) * 1000;

// The caller's audio holds speech up to speechEndSample, then silence. The clock that matters
// starts when the last speech sample reaches the detector.
export async function listenToCaller(
  audio: Float32Array,
  speechEndSample: number,
  recognizer: Recognizer,
  vad: ReturnType<typeof createVad>,
): Promise<Heard> {
  vad.reset();
  const startedAt = performance.now();
  let speechEndAt: number | undefined, vadEndAt: number | undefined;
  for (let offset = 0, index = 0; offset < audio.length; offset += windowSamples, index++) {
    // The window arrives at its place in the schedule, as a microphone delivers it. A late wake or
    // a slow decode before it counts toward the latency, never against it.
    const arrivesAt = startedAt + index * windowMs;
    await waitUntil(arrivesAt);
    const window = audio.subarray(offset, offset + windowSamples);
    recognizer.accept(window);
    vad.accept(window);
    if (speechEndAt === undefined) {
      // A pause inside the utterance can close a segment early; only the final one counts.
      vad.clearSegments();
    }
    if (speechEndAt === undefined && offset + windowSamples >= speechEndSample) {
      speechEndAt = arrivesAt;
    }
    if (speechEndAt !== undefined && vad.hasSegment()) {
      vadEndAt = performance.now();
      break;
    }
  }
  if (speechEndAt === undefined || vadEndAt === undefined) {
    throw new Error('the detector never found the end of speech');
  }
  const transcript = await recognizer.finish();
  return { speechEndAt, transcript, transcriptAt: performance.now(), vadEndAt };
}

export function waitUntil(at: number): Promise<void> {
  const wait = at - performance.now();
  return wait > 0 ? Bun.sleep(wait) : Promise.resolve();
}
