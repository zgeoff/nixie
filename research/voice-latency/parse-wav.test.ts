import { expect, test } from 'bun:test';
import { parseWav } from './parse-wav.ts';
import { toWav } from './to-wav.ts';

test('it reads back the sample rate and samples of a recording', () => {
  const parsed = parseWav(toWav(new Float32Array([0, 0.5, -0.5]), 16_000));

  expect(parsed.sampleRate).toBe(16_000);
  expect(Array.from(parsed.samples)).toStrictEqual([0, 16_384 / 32_768, -16_383 / 32_768]);
});

test('it rejects a file that is not a WAV file', () => {
  expect(() => parseWav(new TextEncoder().encode('not a wav file at all, just some text here'))).toThrow(
    'not a PCM WAV file',
  );
});

test('it rejects a stereo WAV file', () => {
  const bytes = toWav(new Float32Array([0, 0]), 16_000);
  new DataView(bytes.buffer).setUint16(22, 2, true);

  expect(() => parseWav(bytes)).toThrow('not a mono 16-bit WAV file');
});
