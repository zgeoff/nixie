import { expect, test } from 'bun:test';
import { pickBlindLetters } from './pick-blind-letters.ts';

test('it gives every candidate one of the first letters, each letter once', () => {
  const letters = pickBlindLetters(['grok', 'gpt-live', 'haiku-clauses', 'sonnet-opener'], 7);

  expect([...letters.values()].toSorted()).toStrictEqual(['A', 'B', 'C', 'D']);
  expect([...letters.keys()].toSorted()).toStrictEqual(['gpt-live', 'grok', 'haiku-clauses', 'sonnet-opener']);
});

test('it gives the same letters for the same seed', () => {
  const candidates = ['grok', 'gpt-live', 'haiku-clauses', 'sonnet-opener'];

  expect(pickBlindLetters(candidates, 7)).toStrictEqual(pickBlindLetters(candidates, 7));
});

test('it shuffles the candidates out of their listed order', () => {
  expect(pickBlindLetters(['grok', 'gpt-live', 'haiku-clauses', 'sonnet-opener'], 7)).toMatchInlineSnapshot(`
    Map {
      "haiku-clauses" => "A",
      "gpt-live" => "B",
      "sonnet-opener" => "C",
      "grok" => "D",
    }
  `);
});
