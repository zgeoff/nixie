import { expect, test } from 'bun:test';
import { buildPairingCode } from './build-pairing-code.ts';

test.each([
  ['the first and last letters', [0, 31], '0z'],
  ['bytes above 31 by their low 5 bits', [32, 63, 255, 128, 100], '0zz04'],
  ['the letters after the skipped i, l, o and u', [18, 20, 22, 27], 'jmpv'],
])('it maps %s', (_label, bytes, expected) => {
  expect(buildPairingCode(new Uint8Array(bytes))).toBe(expected);
});
