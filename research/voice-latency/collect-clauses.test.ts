import { expect, test } from 'bun:test';
import { collectClauses } from './collect-clauses.ts';

test('it cuts at each sentence mark and keeps the unfinished text', () => {
  expect(collectClauses('Sure. Pack a tent! Bring water? And a', 4)).toStrictEqual({
    clauses: ['Sure.', 'Pack a tent!', 'Bring water?'],
    rest: 'And a',
  });
});

test('it cuts at a comma once the clause holds enough words', () => {
  expect(collectClauses('For a soft yolk, boil it for six minutes', 4)).toStrictEqual({
    clauses: ['For a soft yolk,'],
    rest: 'boil it for six minutes',
  });
});

test('it holds a comma clause that has too few words', () => {
  expect(collectClauses('Well, boil it for six minutes', 4)).toStrictEqual({
    clauses: [],
    rest: 'Well, boil it for six minutes',
  });
});

test('it joins a short comma clause to the next break', () => {
  expect(collectClauses('Well, boil it for six minutes. Then', 4)).toStrictEqual({
    clauses: ['Well, boil it for six minutes.'],
    rest: 'Then',
  });
});

test.each([
  ['semicolon', 'Cats like small spaces; they feel safe there', 'Cats like small spaces;'],
  ['colon', 'Here is the trick for it: run it under hot water', 'Here is the trick for it:'],
  ['dash', 'A box keeps them warm — and hidden too', 'A box keeps them warm —'],
])('it cuts at a %s once the clause holds enough words', (_, text, clause) => {
  expect(collectClauses(text, 4).clauses).toStrictEqual([clause]);
});

test('it leaves a mark with no space after it, such as a decimal point, inside the clause', () => {
  expect(collectClauses('Water it every 2.5 weeks', 4)).toStrictEqual({
    clauses: [],
    rest: 'Water it every 2.5 weeks',
  });
});
