import { expect, test } from 'bun:test';
import { normalizeFactText } from './normalize-fact-text';

test('it reads two texts that differ only in case, spacing and a closing full stop as one', () => {
  expect(normalizeFactText('  The owner  likes\tjazz. ')).toBe(
    normalizeFactText('the owner likes jazz'),
  );
});

test('it reads a composed and a decomposed accent as one', () => {
  expect(normalizeFactText('Café')).toBe(normalizeFactText('Café'));
});

test('it keeps a reworded text apart', () => {
  expect(normalizeFactText('The owner likes jazz.')).not.toBe(
    normalizeFactText('The owner enjoys jazz.'),
  );
});
