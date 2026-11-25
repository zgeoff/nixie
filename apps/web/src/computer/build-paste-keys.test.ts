import { expect, test } from 'bun:test';
import { buildPasteKeys } from './build-paste-keys';

test.each([
  { name: 'ASCII text', text: 'hunter2', keys: [0x68, 0x75, 0x6e, 0x74, 0x65, 0x72, 0x32] },
  {
    name: 'characters outside ASCII left out',
    text: 'né☃日😀x',
    keys: [0x6e, 0x78],
  },
  {
    name: 'a line break of each kind as one Return',
    text: 'a\nb\r\nc\rd',
    keys: [0x61, 0xff_0d, 0x62, 0xff_0d, 0x63, 0xff_0d, 0x64],
  },
  { name: 'a tab as Tab', text: 'a\tb', keys: [0x61, 0xff_09, 0x62] },
  {
    name: 'control characters left out',
    text: 'a\u0000\u0007\u001B\u007F\u0085b',
    keys: [0x61, 0x62],
  },
])('it builds the keys for $name', (row) => {
  expect(buildPasteKeys(row.text)).toStrictEqual([...row.keys]);
});

test('it builds no keys for no text', () => {
  expect(buildPasteKeys('')).toStrictEqual([]);
});
