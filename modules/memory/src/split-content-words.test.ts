import { expect, test } from 'bun:test';
import { splitContentWords } from './split-content-words';

test('it leaves the function words of a message out, whatever their case', () => {
  expect(splitContentWords('I need to book a train To Manchester')).toStrictEqual([
    'need',
    'book',
    'train',
    'Manchester',
  ]);
});

test('it leaves out the fragments a contraction leaves at its apostrophe', () => {
  expect(splitContentWords("Don't forget it’s Priya's birthday")).toStrictEqual([
    'forget',
    'Priya',
    'birthday',
  ]);
});

test('it keeps an acronym that reads as a function word in lower case', () => {
  expect(splitContentWords('Moving to the US to work in IT')).toStrictEqual([
    'Moving',
    'US',
    'work',
    'IT',
  ]);
});

test('it returns no word for text of only function words', () => {
  expect(splitContentWords('Who is it that’s in there?')).toStrictEqual([]);
});
