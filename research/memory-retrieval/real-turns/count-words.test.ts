import { expect, test } from 'bun:test';
import { countWords } from './count-words.ts';

test.each([
  ['an emoji alone', '❤️', 0],
  ['a short reply', "it's good", 3],
  ['a question', "what's next?", 3],
  ['a sentence with digits', 'book 2 seats for 7pm', 5],
])('it counts %s as its sequences of letters or digits', (_, text, words) => {
  expect(countWords(text)).toBe(words);
});
