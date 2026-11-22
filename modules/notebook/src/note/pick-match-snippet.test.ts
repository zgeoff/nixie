import { expect, test } from 'bun:test';
import { pickMatchSnippet } from './pick-match-snippet';

test('it shows the text around the earliest query word the body holds', () => {
  const body = `${'a'.repeat(80)} heating ${'b'.repeat(80)} boiler`;

  expect(pickMatchSnippet(body, ['boiler', 'heating'])).toBe(
    `…${'a'.repeat(49)} heating ${'b'.repeat(49)}…`,
  );
});

test('it shows the start of the body when it holds no query word', () => {
  expect(pickMatchSnippet('The trips follow a cold night.', ['winter'])).toBe(
    'The trips follow a cold night.',
  );
});
