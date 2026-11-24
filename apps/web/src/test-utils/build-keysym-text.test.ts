import { expect, test } from 'bun:test';
import { buildKeysymText } from './build-keysym-text';

test.each([
  { name: 'an ASCII letter', keysym: 0x6e, text: 'n' },
  { name: 'a Latin-1 letter', keysym: 0xe9, text: 'é' },
  { name: 'a Unicode keysym', keysym: 0x01_00_26_03, text: '☃' },
  { name: 'Return', keysym: 0xff_0d, text: '\n' },
  { name: 'Tab', keysym: 0xff_09, text: '\t' },
  { name: 'a control keysym', keysym: 0xff_1b, text: '' },
  { name: 'a C1 control code point', keysym: 0x85, text: '' },
])('it turns $name into the text a field receives', (row) => {
  expect(buildKeysymText(row.keysym)).toBe(row.text);
});
