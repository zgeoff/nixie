import { expect, test } from 'bun:test';
import { clipBrief } from './clip-brief';

test.each([
  {
    name: 'a one-line text whole',
    text: ' Water the beds. ',
    expected: 'Water the beds.',
    isClipped: false,
  },
  {
    name: 'a text of several lines to its first line',
    text: 'Water the beds.\nThen the pots.',
    expected: 'Water the beds.',
    isClipped: true,
  },
])('it keeps $name', (row) => {
  expect(clipBrief(row.text)).toStrictEqual({ text: row.expected, isClipped: row.isClipped });
});

test('it cuts a first line past 200 graphemes and ends it with an ellipsis', () => {
  const clipped = clipBrief('a'.repeat(250));

  expect(clipped).toStrictEqual({ text: `${'a'.repeat(200)}…`, isClipped: true });
});
