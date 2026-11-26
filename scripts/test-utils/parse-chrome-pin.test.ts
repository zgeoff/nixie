import { expect, test } from 'bun:test';
import { parseChromePin } from './parse-chrome-pin';

test('it reads the version and the checksum', () => {
  const text = JSON.stringify({ version: '159.0.8154.6', sha256: 'a'.repeat(64) });

  expect(parseChromePin(text)).toStrictEqual({
    version: '159.0.8154.6',
    sha256: 'a'.repeat(64),
  });
});

test.each([
  ['a short version', { version: '159', sha256: 'a'.repeat(64) }],
  ['a short checksum', { version: '159.0.8154.6', sha256: 'abc' }],
  ['no checksum', { version: '159.0.8154.6' }],
])('it refuses %s', (_name, value) => {
  expect(() => parseChromePin(JSON.stringify(value))).toThrow('chrome-pin.json');
});
