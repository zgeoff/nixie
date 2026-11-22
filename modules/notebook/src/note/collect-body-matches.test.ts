import { expect, test } from 'bun:test';
import { collectBodyMatches } from './collect-body-matches';
import { cutBodyParts } from './cut-body-parts';

test('it finds the part where the text first appears, ignoring case', () => {
  const body = `${'filler '.repeat(40)}\n\nTried the Zine Layout with two columns.\n\n${'more '.repeat(10)}`;
  const parts = cutBodyParts(body, 150, 150);
  const matches = collectBodyMatches(body, parts, 'zine layout');

  expect(matches.map((match) => match.part)).toStrictEqual([
    parts.findIndex((part) => part.includes('Zine Layout')) + 1,
  ]);
});

test('it shows about 50 characters on each side with ellipses where the body goes on', () => {
  const body = `${'a'.repeat(100)} needle ${'b'.repeat(100)}`;
  const [match] = collectBodyMatches(body, [body], 'needle');

  expect(match?.text).toBe(`…${'a'.repeat(49)} needle ${'b'.repeat(49)}…`);
});

test('it takes the text as plain text, never a pattern', () => {
  expect(
    collectBodyMatches('a.c abc', ['a.c abc'], 'a.c').map((match) => match.text),
  ).toStrictEqual(['a.c abc']);
});

test('it answers up to 10 matches', () => {
  const body = 'x '.repeat(30);

  expect(collectBodyMatches(body, [body], 'x')).toHaveLength(10);
});

test('it answers no match for text that appears nowhere', () => {
  expect(collectBodyMatches('alpha', ['alpha'], 'zeta')).toStrictEqual([]);
});
