import { expect, test } from 'bun:test';
import { scrubText } from './scrub-text';

test('it replaces a form in text with the marker', () => {
  expect(scrubText('failed with fake-value', ['fake-value'])).toBe('failed with [secret removed]');
});
