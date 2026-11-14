import { expect, test } from 'bun:test';
import { parseItemCursor } from './parse-item-cursor';

test('it reads no cursor as the start', () => {
  expect(parseItemCursor(undefined)).toBe(0);
});

test('it reads a cursor as the creation sequence it holds', () => {
  expect(parseItemCursor('42')).toBe(42);
});

test.each([['page-two'], ['-1'], ['9007199254740993']])('it rejects the cursor %s', (cursor) => {
  expect(() => parseItemCursor(cursor)).toThrow(
    expect.objectContaining({ code: 'INVALID_CURSOR' }),
  );
});
