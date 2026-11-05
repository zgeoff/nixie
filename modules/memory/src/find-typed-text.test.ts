import { expect, test } from 'bun:test';
import { findTypedText } from './find-typed-text';

test.each([
  {
    title: 'keeps the whole text of a message with no spans',
    fields: { text: 'water the ferns' },
    expected: 'water the ferns',
  },
  {
    title: 'keeps the whole text when every span is unknown',
    fields: { text: 'water the ferns', spans: [{ start: 0, end: 15, source: 'unknown' }] },
    expected: 'water the ferns',
  },
  {
    title: 'puts a line break in place of each pasted or dropped span',
    fields: {
      text: 'fix this: LOG LINE and this: FILE',
      spans: [
        { start: 0, end: 10, source: 'typed' },
        { start: 10, end: 18, source: 'pasted' },
        { start: 18, end: 29, source: 'typed' },
        { start: 29, end: 33, source: 'dropped' },
      ],
    },
    expected: 'fix this: \n and this: \n',
  },
  {
    title: 'finds nothing in a message that is all pasted',
    fields: { text: 'LOG LINE', spans: [{ start: 0, end: 8, source: 'pasted' }] },
    expected: null,
  },
  {
    title: 'finds nothing in a message with no text',
    fields: { spans: [] },
    expected: null,
  },
])('it $title', (row) => {
  expect(findTypedText(row.fields)).toBe(row.expected);
});

test('it keeps a typed message longer than 1,000 characters whole', () => {
  const text = 'a'.repeat(1500);

  expect(findTypedText({ text, spans: [{ start: 0, end: 1500, source: 'typed' }] })).toBe(text);
});
