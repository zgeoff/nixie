import { expect, test } from 'bun:test';
import { toFloatSamples } from './to-float-samples.ts';

test('it reads little-endian 16-bit PCM as samples from -1 to 1', () => {
  const pcm = Buffer.from([0x00, 0x00, 0x00, 0x40, 0x00, 0xc0, 0x00, 0x80]).toString('base64');

  expect(Array.from(toFloatSamples(pcm))).toStrictEqual([0, 0.5, -0.5, -1]);
});

test('it drops a trailing odd byte', () => {
  const pcm = Buffer.from([0x00, 0x40, 0x7f]).toString('base64');

  expect(Array.from(toFloatSamples(pcm))).toStrictEqual([0.5]);
});
