// The first and last sample at or above the threshold, so a reply's silent lead-in and tail never
// count as speech. GPT-Live streams near-silent audio for the whole session.
export function findSoundSpan(
  samples: Float32Array,
  threshold: number,
): { end: number; start: number } | undefined {
  const start = samples.findIndex((sample) => Math.abs(sample) >= threshold);
  if (start === -1) {
    return undefined;
  }
  const end = samples.findLastIndex((sample) => Math.abs(sample) >= threshold);
  return { end, start };
}
