// Scales the samples so the loudest one reaches the peak, as a client's gain control raises a quiet
// microphone. Silence stays silence.
export function toPeakLevel(samples: Float32Array, peak: number): Float32Array {
  const loudest = samples.reduce((most, sample) => Math.max(most, Math.abs(sample)), 0);
  return loudest === 0 ? samples : samples.map((sample) => (sample * peak) / loudest);
}
