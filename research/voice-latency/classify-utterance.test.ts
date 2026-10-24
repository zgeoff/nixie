import { expect, test } from 'bun:test';
import { join } from 'node:path';
// @ts-expect-error sherpa-onnx-node ships no type declarations for its entry point.
import sherpa from 'sherpa-onnx-node';
import { classifyUtterance } from './classify-utterance.ts';
import { createVad, modelsDir } from './speech.ts';

// A LibriSpeech sentence that ships with the Zipformer model, which models.sh downloads.
const clipPath = join(
  modelsDir,
  'sherpa-onnx-streaming-zipformer-en-2023-06-26',
  'test_wavs',
  '0.wav',
);

test('it hears a recorded sentence with no long pause as one turn at a 300 ms pause', () => {
  const clip: { samples: Float32Array } = sherpa.readWave(clipPath);

  expect(classifyUtterance(createVad(300), clip.samples)).toMatchObject({
    cutOff: false,
    gapsMs: [],
    segments: 1,
  });
});

test('it cuts off a sentence with a 600 ms pause at a 300 ms pause', () => {
  const clip: { samples: Float32Array } = sherpa.readWave(clipPath);
  const paused = new Float32Array(clip.samples.length + 9600);
  paused.set(clip.samples.subarray(0, 48_000));
  paused.set(clip.samples.subarray(48_000), 48_000 + 9600);

  const utterance = classifyUtterance(createVad(300), paused);

  expect(utterance).toMatchObject({ cutOff: true, segments: 2 });
  expect(utterance.gapsMs).toHaveLength(1);
  expect(utterance.gapsMs[0]).toBeGreaterThanOrEqual(300);
  expect(utterance.gapsMs[0]).toBeLessThan(900);
});

test('it hears a sentence with a 600 ms pause as one turn at a 500 ms pause', () => {
  const clip: { samples: Float32Array } = sherpa.readWave(clipPath);
  const paused = new Float32Array(clip.samples.length + 9600);
  paused.set(clip.samples.subarray(0, 48_000));
  paused.set(clip.samples.subarray(48_000), 48_000 + 9600);

  expect(classifyUtterance(createVad(500), paused)).toMatchObject({
    cutOff: false,
    gapsMs: [],
    segments: 1,
  });
});
