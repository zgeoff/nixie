import { expect, test } from 'bun:test';
import { collectNewWords } from './collect-new-words.ts';

test.each([
  ['the spoken text repeats the sent text', 'The bus leaves at noon.', 'The bus leaves at noon.', []],
  ['a number comes back as digits', 'The shop opens at nine.', 'The shop opens at 9.', []],
  ['the speech layer adds a fact', 'You have two things.', 'You have two things: a team sync at 10.', ['a', 'team', 'sync', 'at', '10']],
  ['a new word comes up twice', 'The bus leaves.', 'The bus leaves soon, very soon.', ['soon', 'very']],
  ['nothing was spoken', 'The bus leaves at noon.', '', []],
])('#collectNewWords lists each spoken word missing from the sent text when %s', (_, sent, spoken, newWords) => {
  expect(collectNewWords(sent, spoken)).toStrictEqual(newWords);
});
