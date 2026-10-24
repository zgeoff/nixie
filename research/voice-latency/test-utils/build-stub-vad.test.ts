import { expect, test } from 'bun:test';
import { buildStubVad } from './build-stub-vad.ts';

test('it holds a segment until the detector has taken in its closing sample count', () => {
  const vad = buildStubVad([{ closesAfterSamples: 1000, end: 800, start: 100 }]);
  vad.accept(new Float32Array(512));

  expect(vad.readSegments()).toStrictEqual([]);
});

test('it hands each segment out once, in order, after its closing sample count', () => {
  const vad = buildStubVad([
    { closesAfterSamples: 1000, end: 800, start: 100 },
    { closesAfterSamples: 1500, end: 1300, start: 1100 },
  ]);
  vad.accept(new Float32Array(1024));
  vad.readSegments();
  vad.accept(new Float32Array(512));

  expect(vad.readSegments()).toStrictEqual([{ end: 1300, start: 1100 }]);
});

test('it starts the count again after a reset', () => {
  const vad = buildStubVad([{ closesAfterSamples: 1000, end: 800, start: 100 }]);
  vad.accept(new Float32Array(1024));
  vad.readSegments();
  vad.reset();
  vad.accept(new Float32Array(1024));

  expect(vad.readSegments()).toStrictEqual([{ end: 800, start: 100 }]);
});
