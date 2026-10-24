import { expect, test } from 'bun:test';
import { buildLogMel, melFrames } from './build-log-mel.ts';

// The expected cells come from Hugging Face's WhisperFeatureExtractor(chunk_length=8) on the same
// tone, front-padded to 8 s as Smart Turn's reference inference pads it.
test('it matches the Whisper feature extractor on a one-second 440 Hz tone', () => {
  const tone = Float32Array.from({ length: 16_000 }, (_, index) => 0.5 * Math.sin((2 * Math.PI * 440 * index) / 16_000));

  const features = buildLogMel(tone);

  expect(
    [
      [0, 0],
      [0, 799],
      [10, 790],
      [40, 795],
      [79, 700],
    ].map(([mel = 0, frame = 0]) => Number((features[mel * melFrames + frame] ?? Number.NaN).toFixed(6))),
  ).toStrictEqual([-0.110252, 0.929244, 1.800282, -0.110252, 0.219338]);
});

test('it builds the same features from the same audio', () => {
  const noise = Float32Array.from({ length: 48_000 }, (_, index) => Math.sin(index * 12.9898) * 0.3);

  expect(buildLogMel(noise)).toStrictEqual(buildLogMel(noise));
});
