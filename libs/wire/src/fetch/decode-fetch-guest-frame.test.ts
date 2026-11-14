import { expect, test } from 'bun:test';
import { decodeFetchGuestFrame } from './decode-fetch-guest-frame';

test('it reads a hop frame', () => {
  const bytes = new TextEncoder().encode('{"kind":"hop","url":"https://example.com/next"}');

  expect(decodeFetchGuestFrame(bytes)).toStrictEqual({
    kind: 'hop',
    url: 'https://example.com/next',
  });
});

test('it reads a reply frame as a reply', () => {
  const bytes = new TextEncoder().encode('{"kind":"refused","reason":"no","isGated":true}');

  expect(decodeFetchGuestFrame(bytes)).toStrictEqual({
    kind: 'refused',
    reason: 'no',
    isGated: true,
  });
});

test('it refuses a hop frame with no url', () => {
  const bytes = new TextEncoder().encode('{"kind":"hop"}');

  expect(() => decodeFetchGuestFrame(bytes)).toThrowWithMessage(TypeError, /url/u);
});

test('it refuses a frame that is not JSON', () => {
  expect(() => decodeFetchGuestFrame(new TextEncoder().encode('not json'))).toThrow();
});
