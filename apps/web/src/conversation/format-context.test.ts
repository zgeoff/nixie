import { expect, test } from 'bun:test';
import { formatContext } from './format-context';

test('it formats the context size against its window', () => {
  expect(formatContext({ size: 41_000, window: 400_000 })).toBe('41k / 400k');
});
