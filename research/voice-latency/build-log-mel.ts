// Whisper's log-mel features, as the Hugging Face WhisperFeatureExtractor builds them with
// do_normalize on: Smart Turn was trained on that extractor's output, so each step matches it.
import { sampleRate } from './speech.ts';

export const melBins = 80;
const windowSamples = sampleRate * 8;
const fftSize = 400;
const hopSize = 160;
export const melFrames = windowSamples / hopSize;
const frequencyBins = fftSize / 2 + 1;

// Takes the last 8 s of audio, with zeros in front of shorter audio, as Smart Turn's reference
// inference does, and returns the features row by row, 80 mel bins of 800 frames.
export function buildLogMel(audio: Float32Array): Float32Array {
  const window = new Float64Array(windowSamples);
  const kept = audio.subarray(Math.max(0, audio.length - windowSamples));
  window.set(kept, windowSamples - kept.length);
  normalize(window);
  const power = buildPowerSpectrogram(window);
  const features = new Float32Array(melBins * melFrames);
  let peak = Number.NEGATIVE_INFINITY;
  for (let frame = 0; frame < melFrames; frame++) {
    const frameStart = frame * frequencyBins;
    for (const [mel, filter] of melFilters.entries()) {
      let energy = 0;
      for (const [offset, weight] of filter.weights.entries()) {
        energy += weight * (power[frameStart + filter.firstBin + offset] ?? 0);
      }
      const logEnergy = Math.log10(Math.max(energy, 1e-10));
      features[mel * melFrames + frame] = logEnergy;
      peak = Math.max(peak, logEnergy);
    }
  }
  for (const [index, value] of features.entries()) {
    features[index] = (Math.max(value, peak - 8) + 4) / 4;
  }
  return features;
}

function normalize(samples: Float64Array): void {
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
  const scale = 1 / Math.sqrt(variance + 1e-7);
  for (const [index, value] of samples.entries()) {
    samples[index] = (value - mean) * scale;
  }
}

// A centred short-time Fourier transform with reflect padding and a periodic Hann window. The
// extractor drops the last of its 801 frames.
function buildPowerSpectrogram(samples: Float64Array): Float64Array {
  const half = fftSize / 2;
  const power = new Float64Array(melFrames * frequencyBins);
  const real = new Float64Array(fftSize);
  const imaginary = new Float64Array(fftSize);
  for (let frame = 0; frame < melFrames; frame++) {
    for (const [offset, inputIndex] of fftInputOrder.entries()) {
      const sample = samples[reflect(frame * hopSize + inputIndex - half, samples.length)] ?? 0;
      real[offset] = sample * (hann[inputIndex] ?? 0);
      imaginary[offset] = 0;
    }
    transformInPlace(real, imaginary);
    for (let bin = 0; bin < frequencyBins; bin++) {
      power[frame * frequencyBins + bin] = (real[bin] ?? 0) ** 2 + (imaginary[bin] ?? 0) ** 2;
    }
  }
  return power;
}

function reflect(index: number, length: number): number {
  if (index < 0) {
    return -index;
  }
  return index >= length ? 2 * (length - 1) - index : index;
}

const hann = Float64Array.from(
  { length: fftSize },
  (_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / fftSize),
);

// 400 = 2^4 × 5^2, so a mixed-radix transform keeps a frame to a few thousand operations, where a
// direct transform costs 160,000 and makes Smart Turn's wait on a 2-vCPU host too long.
const radices = [2, 2, 2, 2, 5, 5];
const fftInputOrder = buildInputOrder(
  Array.from({ length: fftSize }, (_, index) => index),
  0,
);
const twiddleReal = Float64Array.from({ length: fftSize }, (_, index) =>
  Math.cos((-2 * Math.PI * index) / fftSize),
);
const twiddleImaginary = Float64Array.from({ length: fftSize }, (_, index) =>
  Math.sin((-2 * Math.PI * index) / fftSize),
);
const scratchReal = new Float64Array(fftSize);
const scratchImaginary = new Float64Array(fftSize);

// Decimation in time: each level splits its indices by remainder, so the inputs sit in the order
// that lets each level combine contiguous blocks.
function buildInputOrder(indices: number[], depth: number): number[] {
  const radix = radices[depth];
  if (radix === undefined) {
    return indices;
  }
  return Array.from({ length: radix }, (_, part) =>
    buildInputOrder(
      indices.filter((_, position) => position % radix === part),
      depth + 1,
    ),
  ).flat();
}

function transformInPlace(real: Float64Array, imaginary: Float64Array): void {
  let span = 1;
  for (const radix of radices.toReversed()) {
    const blockSize = span * radix;
    const stride = fftSize / blockSize;
    for (let blockStart = 0; blockStart < fftSize; blockStart += blockSize) {
      for (let bin = 0; bin < blockSize; bin++) {
        let sumReal = 0;
        let sumImaginary = 0;
        for (let part = 0; part < radix; part++) {
          const source = blockStart + part * span + (bin % span);
          const turn = (part * bin * stride) % fftSize;
          const valueReal = real[source] ?? 0;
          const valueImaginary = imaginary[source] ?? 0;
          const cos = twiddleReal[turn] ?? 0;
          const sin = twiddleImaginary[turn] ?? 0;
          sumReal += valueReal * cos - valueImaginary * sin;
          sumImaginary += valueReal * sin + valueImaginary * cos;
        }
        scratchReal[blockStart + bin] = sumReal;
        scratchImaginary[blockStart + bin] = sumImaginary;
      }
    }
    real.set(scratchReal);
    imaginary.set(scratchImaginary);
    span = blockSize;
  }
}

// The Slaney mel scale with area normalization, from 0 to 8 kHz. Each filter keeps only the bins
// where its weight is above zero.
const melFilters = buildMelFilters();

function buildMelFilters(): { firstBin: number; weights: number[] }[] {
  const toMel = (hertz: number): number =>
    hertz < 1000 ? (3 * hertz) / 200 : 15 + (Math.log(hertz / 1000) * 27) / Math.log(6.4);
  const toHertz = (mel: number): number =>
    mel < 15 ? (200 * mel) / 3 : 1000 * Math.exp(((mel - 15) * Math.log(6.4)) / 27);
  const topMel = toMel(sampleRate / 2);
  const edges = Array.from({ length: melBins + 2 }, (_, index) =>
    toHertz((topMel * index) / (melBins + 1)),
  );
  return Array.from({ length: melBins }, (_, mel) => {
    const low = edges[mel] ?? 0;
    const centre = edges[mel + 1] ?? 0;
    const high = edges[mel + 2] ?? 0;
    const weights = Array.from({ length: frequencyBins }, (_, bin) => {
      const hertz = (bin * sampleRate) / fftSize;
      const rising = (hertz - low) / (centre - low);
      const falling = (high - hertz) / (high - centre);
      return Math.max(0, Math.min(rising, falling)) * (2 / (high - low));
    });
    const firstBin = weights.findIndex((weight) => weight > 0);
    const lastBin = weights.findLastIndex((weight) => weight > 0);
    return firstBin === -1
      ? { firstBin: 0, weights: [] }
      : { firstBin, weights: weights.slice(firstBin, lastBin + 1) };
  });
}
