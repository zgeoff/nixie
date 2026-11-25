import { expect, test } from 'bun:test';
import { parseContentType } from './parse-content-type';

test.each([
  ['a plain name', 'attachment; filename="board.png"', 'board.png'],
  [
    'a quoted name that holds a semicolon',
    'attachment; filename="receipt;nov.pdf"',
    'receipt;nov.pdf',
  ],
  ['an escaped quote', String.raw`attachment; filename="the \"board\".png"`, 'the "board".png'],
  ['an extended UTF-8 name', "attachment; filename*=UTF-8''caf%C3%A9.pdf", 'café.pdf'],
  [
    'an extended name that follows a plain one',
    'attachment; filename="cafe.pdf"; filename*=UTF-8\'\'caf%C3%A9.pdf',
    'café.pdf',
  ],
])('#parseContentType reads %s', (_name, header, expected) => {
  const parsed = parseContentType(header);

  expect(parsed.parameters.get('filename')).toBe(expected);
});

test('#parseContentType reads the type in lower case', () => {
  const parsed = parseContentType('Text/HTML; charset=utf8');

  expect([parsed.type, parsed.parameters.get('charset')]).toStrictEqual(['text/html', 'utf8']);
});
