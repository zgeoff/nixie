import { expect, test } from 'bun:test';
import { checkChromeVersion } from './check-chrome-version';
import { parseChromeVersion } from './parse-chrome-version';

test.each([
  ['Google Chrome for Testing 159.0.8154.6\n', '159.0.8154.6'],
  ['Chromium 152.0.7977.75 Arch Linux', '152.0.7977.75'],
  ['no version here', null],
])('it reads the version from %j', (output, expected) => {
  expect(parseChromeVersion(output)).toBe(expected);
});

test('it passes when the browser runs the pinned version', () => {
  expect(() => {
    checkChromeVersion('the lane', 'Google Chrome 159.0.8154.6', '159.0.8154.6');
  }).not.toThrow();
});

test('it fails and names both versions when the browser runs another version', () => {
  expect(() => {
    checkChromeVersion('the lane', 'Google Chrome 160.0.1.2', '159.0.8154.6');
  }).toThrow('the lane runs Chrome 160.0.1.2, but chrome-pin.json pins 159.0.8154.6');
});
