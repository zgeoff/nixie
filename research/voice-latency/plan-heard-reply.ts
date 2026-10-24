import { planPlayback } from './plan-playback.ts';
import type { ReceivedAudio } from './voice-call.ts';

// Plays the received audio back to back, as a client does. At the stop time the client drops all
// it has not yet played, and audio that arrives after the stop plays as a fresh reply.
export function planHeardReply(input: {
  received: ReceivedAudio[];
  sampleRate: number;
  stopAt: number | undefined;
}): { samples: Float32Array; startAt: number }[] {
  const toClip = (chunk: ReceivedAudio): { audioMs: number; readyAt: number; samples: Float32Array } => ({
    audioMs: (chunk.samples.length / input.sampleRate) * 1000,
    readyAt: chunk.at,
    samples: chunk.samples,
  });
  const stopAt = input.stopAt ?? Number.POSITIVE_INFINITY;
  const before = input.received.filter((chunk) => chunk.at < stopAt).map(toClip);
  const after = input.received.filter((chunk) => chunk.at >= stopAt).map(toClip);
  const beforePlan = planPlayback(before, 0);
  const afterPlan = planPlayback(after, 0);
  const cut = before.flatMap((clip, index) => {
    const startAt = beforePlan.startsAt[index] ?? clip.readyAt;
    const kept = Math.min(clip.samples.length, Math.round(((stopAt - startAt) * input.sampleRate) / 1000));
    return kept <= 0 ? [] : [{ samples: clip.samples.subarray(0, kept), startAt }];
  });
  return [...cut, ...after.map((clip, index) => ({ samples: clip.samples, startAt: afterPlan.startsAt[index] ?? clip.readyAt }))];
}
