// The longest stretch inside a span where every sample stays under the threshold, in milliseconds.
// A pause between sentences is part of speech, so a reader compares this with a limit well above it.
export function findLongestSilence(input: {
  end: number;
  sampleRate: number;
  samples: Float32Array;
  start: number;
  threshold: number;
}): number {
  let longest = 0;
  let run = 0;
  for (let index = input.start; index <= input.end; index++) {
    run = Math.abs(input.samples[index] ?? 0) < input.threshold ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return (longest / input.sampleRate) * 1000;
}
