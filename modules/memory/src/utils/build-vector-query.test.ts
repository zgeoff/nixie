import { expect, test } from 'bun:test';
import { buildVectorQuery } from './build-vector-query';

test('it leaves out an excluded word, its possessive and the punctuation beside it, whatever its case', () => {
  expect(buildVectorQuery("Nix, where is Sam's sister living now? Ask NIX", ['nix', 'Sam'])).toBe(
    'where is sister living now? Ask',
  );
});

test('it leaves out each word of a two-word name', () => {
  expect(buildVectorQuery('Avery Smith?', ['Avery Smith'])).toBe('');
});

test('it leaves out either word of a two-word name when the query holds one', () => {
  expect(buildVectorQuery("is Smith's sister in Leeds", ['Avery Smith'])).toBe(
    'is sister in Leeds',
  );
});

test('it keeps a word that only starts with an excluded word', () => {
  expect(buildVectorQuery('Nixon and Samantha', ['Nix', 'Sam'])).toBe('Nixon and Samantha');
});

test('it keeps the query as it is with no excluded words', () => {
  expect(buildVectorQuery('  where is my sister ', [])).toBe('  where is my sister ');
});

test('it leaves nothing of a query of excluded words alone', () => {
  expect(buildVectorQuery('Nix!', ['Nix'])).toBe('');
});
