import { expect, test } from 'bun:test';
import { buildRecording } from './build-recording.ts';

test('it places each clip at its start after the end of the caller speech, then the tail', () => {
  const recording = buildRecording({
    caller: new Float32Array([0.5, 0.25]),
    clips: [
      { samples: new Float32Array([0.125, 0.125]), startMs: 100 },
      { samples: new Float32Array([0.25]), startMs: 400 },
    ],
    sampleRate: 10,
    speechEndSample: 2,
    tailMs: 200,
  });

  expect(Array.from(recording)).toStrictEqual([0.5, 0.25, 0, 0.125, 0.125, 0, 0.25, 0, 0]);
});

test('it adds a clip to the caller audio it overlaps', () => {
  const recording = buildRecording({
    caller: new Float32Array([0.5, 0.25, 0.125, 0.125]),
    clips: [{ samples: new Float32Array([0.25]), startMs: 0 }],
    sampleRate: 10,
    speechEndSample: 2,
    tailMs: 0,
  });

  expect(Array.from(recording)).toStrictEqual([0.5, 0.25, 0.375]);
});

test('it keeps only the caller line and the tail for a reply with no clips', () => {
  const recording = buildRecording({
    caller: new Float32Array([0.5, 0.25, 0, 0]),
    clips: [],
    sampleRate: 10,
    speechEndSample: 2,
    tailMs: 100,
  });

  expect(Array.from(recording)).toStrictEqual([0.5, 0.25, 0]);
});
