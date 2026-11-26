import { expect, test } from 'bun:test';
import { decodeHeaderWords } from './decode-header-words';

test.each([
  { title: 'a plain header', header: 'Q3 numbers', expected: 'Q3 numbers' },
  { title: 'a base64 word', header: '=?UTF-8?B?WmFobGVuIGbDvHIgUTM=?=', expected: 'Zahlen für Q3' },
  { title: 'a Q word', header: '=?utf-8?Q?Gr=C3=BC=C3=9Fe_aus_Bonn?=', expected: 'Grüße aus Bonn' },
  {
    title: 'two adjacent words',
    header: '=?UTF-8?B?WmFobGVu?= =?UTF-8?B?IGbDvHI=?=',
    expected: 'Zahlen für',
  },
  { title: 'a charset it lacks', header: '=?x-nope?B?aGk=?=', expected: '=?x-nope?B?aGk=?=' },
])('it decodes $title', (row) => {
  expect(decodeHeaderWords(row.header)).toBe(row.expected);
});
