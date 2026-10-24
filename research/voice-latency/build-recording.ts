export interface PlacedClip {
  samples: Float32Array;
  // When the clip starts to play, from the end of the caller's speech.
  startMs: number;
}

// Lays one exchange out as a listener hears it: the caller's line, then each clip of the reply at
// the time it started to play, so the waits before and inside the reply stay audible.
export function buildRecording(input: {
  caller: Float32Array;
  clips: PlacedClip[];
  sampleRate: number;
  speechEndSample: number;
  tailMs: number;
}): Float32Array {
  const toSample = (ms: number): number => Math.round((ms * input.sampleRate) / 1000);
  const replyEnd = Math.max(
    input.speechEndSample,
    ...input.clips.map((clip) => input.speechEndSample + toSample(clip.startMs) + clip.samples.length),
  );
  const recording = new Float32Array(replyEnd + toSample(input.tailMs));
  recording.set(input.caller.subarray(0, Math.min(input.caller.length, recording.length)));
  for (const clip of input.clips) {
    const offset = input.speechEndSample + toSample(clip.startMs);
    for (const [index, sample] of clip.samples.entries()) {
      recording[offset + index] = (recording[offset + index] ?? 0) + sample;
    }
  }
  return recording;
}
