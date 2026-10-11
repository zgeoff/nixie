import { expect, test } from 'bun:test';
import { requireLiveValue } from './require-live-value';

test('it returns a value that is set', () => {
  expect(requireLiveValue('https://nixie.example.com', 'NIXIE_LIVE_URL')).toBe(
    'https://nixie.example.com',
  );
});

test('it throws with the variable when the value is null', () => {
  expect(() => requireLiveValue(null, 'NIXIE_LIVE_URL')).toThrowWithMessage(
    Error,
    'the live check needs NIXIE_LIVE_URL',
  );
});
