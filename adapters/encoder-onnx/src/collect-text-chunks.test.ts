import { expect, test } from 'bun:test';
import { collectTextChunks } from './collect-text-chunks';

test.each([
  {
    name: 'a text that fits as one chunk',
    text: '  The boiler service is booked.  ',
    maxTokens: 10,
    chunks: ['The boiler service is booked.'],
  },
  {
    name: 'paragraphs packed up to the limit',
    text: 'One two three.\n\nFour five.\n\nSix seven eight nine.',
    maxTokens: 5,
    chunks: ['One two three.\n\nFour five.', 'Six seven eight nine.'],
  },
  {
    name: 'a long paragraph split at its sentences',
    text: 'One two three. Four five six. Seven eight.',
    maxTokens: 6,
    chunks: ['One two three. Four five six.', 'Seven eight.'],
  },
  {
    name: 'a long sentence split at its words',
    text: 'one two three four five six seven',
    maxTokens: 3,
    chunks: ['one two three', 'four five six', 'seven'],
  },
  {
    name: 'a blank text as no chunk',
    text: ' \n\n ',
    maxTokens: 3,
    chunks: [],
  },
])('it splits $name', (row) => {
  const chunks = collectTextChunks(
    row.text,
    (text) => text.split(/\s+/u).filter((word) => word !== '').length,
    row.maxTokens,
  );

  expect(chunks).toStrictEqual(row.chunks);
});

test('it halves a word that alone runs over the limit', () => {
  const chunks = collectTextChunks('abcdefgh ij', (text) => text.replaceAll(/\s/gu, '').length, 3);

  expect(chunks).toStrictEqual(['ab', 'cd', 'ef', 'gh', 'ij']);
});
