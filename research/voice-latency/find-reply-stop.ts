// The first sample from the start where a silence of at least the minimum begins, so a reply cut
// off by the caller counts as stopped where its sound ends, while a pause between sentences, which
// is shorter, does not.
export function findReplyStop(input: {
  minSilenceSamples: number;
  samples: Float32Array;
  start: number;
  threshold: number;
}): number | undefined {
  let runStart = input.start;
  for (let index = input.start; index < input.samples.length; index++) {
    if (Math.abs(input.samples[index] ?? 0) >= input.threshold) {
      runStart = index + 1;
    } else if (index + 1 - runStart >= input.minSilenceSamples) {
      return runStart;
    }
  }
  return undefined;
}
