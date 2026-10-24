import { expect, test } from 'bun:test';
import { toFloatSamples } from './to-float-samples.ts';
import { toPcmBase64 } from './to-pcm-base64.ts';

test('it writes samples as little-endian 16-bit PCM, clipping samples outside the range', () => {
  expect(Array.from(Buffer.from(toPcmBase64(new Float32Array([0, 1, -1, 2])), 'base64'))).toStrictEqual([
    0x00, 0x00, 0xff, 0x7f, 0x01, 0x80, 0xff, 0x7f,
  ]);
});

test('it reads back as the samples it wrote, to the precision of 16 bits', () => {
  expect(Array.from(toFloatSamples(toPcmBase64(new Float32Array([0, 0.5, -0.5]))))).toStrictEqual([
    0,
    16_384 / 32_768,
    -16_383 / 32_768,
  ]);
});
