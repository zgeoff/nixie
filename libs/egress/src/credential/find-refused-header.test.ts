import { expect, test } from 'bun:test';
import { findRefusedHeader } from './find-refused-header';

test.each(['Authorization', 'proxy-authorization', 'COOKIE'])('it refuses %s', (name) => {
  expect(findRefusedHeader([name], null)).toBe(name);
});

test("it refuses the credential's own header without regard to case", () => {
  expect(findRefusedHeader(['X-API-Key'], 'x-api-key')).toBe('X-API-Key');
});

test('it passes a header that carries no identity', () => {
  expect(findRefusedHeader(['content-type', 'x-api-key'], null)).toBeNull();
});
