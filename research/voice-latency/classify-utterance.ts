import type { createVad } from './speech.ts';
import { sampleRate } from './speech.ts';

export interface UtteranceClass {
  // A turn ends at the first segment, so a second segment means the caller was cut off.
  cutOff: boolean;
  firstEndMs?: number;
  gapsMs: number[];
  // The share of the utterance, from its first speech to its last, heard before the turn ended.
  heardShare?: number;
  lastEndMs?: number;
  segments: number;
}

// The detector needs silence after the last word to close the final segment.
const tailSamples = sampleRate * 1.5;
const windowSamples = 512;

// Plays a whole utterance through the detector, 32 ms at a time, and reports whether the detector's
// pause setting would end the turn before the utterance's last speech.
export function classifyUtterance(
  vad: ReturnType<typeof createVad>,
  speech: Float32Array,
): UtteranceClass {
  const audio = new Float32Array(speech.length + tailSamples);
  audio.set(speech);
  vad.reset();
  for (let offset = 0; offset < audio.length; offset += windowSamples) {
    vad.accept(audio.subarray(offset, offset + windowSamples));
  }
  const segments = vad.readSegments();
  const first = segments[0];
  const last = segments.at(-1);
  return {
    cutOff: segments.length > 1,
    firstEndMs: first ? toMs(first.end) : undefined,
    gapsMs: segments
      .slice(1)
      .map((segment, index) => Math.round(toMs(segment.start - (segments[index]?.end ?? 0)))),
    heardShare:
      first && last && segments.length > 1
        ? (first.end - first.start) / (last.end - first.start)
        : undefined,
    lastEndMs: last ? toMs(last.end) : undefined,
    segments: segments.length,
  };
}

function toMs(samples: number): number {
  return (samples * 1000) / sampleRate;
}
