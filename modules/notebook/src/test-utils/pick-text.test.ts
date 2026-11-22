import { expect, test } from 'bun:test';
import { pickText } from './pick-text';

test('it returns a string as it is', () => {
  expect(pickText('abc')).toBe('abc');
});

test('it throws for a value that is not a string', () => {
  expect(() => pickText(12)).toThrow();
});
