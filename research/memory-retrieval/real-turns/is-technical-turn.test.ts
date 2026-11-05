import { expect, test } from 'bun:test';
import { isTechnicalTurn } from './is-technical-turn.ts';

test.each([
  ['a path', 'look at src/index.ts'],
  ['an issue ID', 'is ABC-12 done?'],
  ['a word from software work', 'the deploy failed again'],
])('it counts a message with %s as technical', (_name, query) => {
  expect(isTechnicalTurn({ query })).toBe(true);
});

test('it counts a message with none of them as chat', () => {
  expect(isTechnicalTurn({ query: 'long day, off to bed soon' })).toBe(false);
});
