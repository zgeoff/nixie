import { expect, test } from 'bun:test';
import type { SpanState } from '@heynixie/contract';
import { buildTrimmedMessage } from './build-trimmed-message';

test.each<[string, SpanState, SpanState]>([
  [
    'typed text with blank lines and spaces around it',
    { spans: [{ end: 12, source: 'typed', start: 0 }], text: '\n\n  hello  \n' },
    { spans: [{ end: 5, source: 'typed', start: 0 }], text: 'hello' },
  ],
  [
    'tabs around typed text',
    { spans: [{ end: 7, source: 'typed', start: 0 }], text: '\thello\t' },
    { spans: [{ end: 5, source: 'typed', start: 0 }], text: 'hello' },
  ],
  [
    'blank lines before a pasted block, keeping its span on the same characters',
    {
      spans: [
        { end: 2, source: 'typed', start: 0 },
        { end: 9, source: 'pasted', start: 2 },
      ],
      text: '\n\nabcdefg',
    },
    { spans: [{ end: 7, source: 'pasted', start: 0 }], text: 'abcdefg' },
  ],
  [
    'a pasted block that opens the message with its own leading spaces',
    {
      spans: [
        { end: 6, source: 'pasted', start: 0 },
        { end: 10, source: 'typed', start: 6 },
      ],
      text: '  code end',
    },
    {
      spans: [
        { end: 6, source: 'pasted', start: 0 },
        { end: 10, source: 'typed', start: 6 },
      ],
      text: '  code end',
    },
  ],
  [
    'a pasted block that ends the message with trailing whitespace',
    {
      spans: [
        { end: 4, source: 'typed', start: 0 },
        { end: 10, source: 'pasted', start: 4 },
      ],
      text: ' hi code \n',
    },
    {
      spans: [
        { end: 3, source: 'typed', start: 0 },
        { end: 9, source: 'pasted', start: 3 },
      ],
      text: 'hi code \n',
    },
  ],
  [
    'whitespace between words',
    { spans: [{ end: 9, source: 'typed', start: 0 }], text: 'a  b\n\n c ' },
    { spans: [{ end: 8, source: 'typed', start: 0 }], text: 'a  b\n\n c' },
  ],
  [
    'whitespace only',
    { spans: [{ end: 4, source: 'typed', start: 0 }], text: ' \n\t ' },
    { spans: [], text: '' },
  ],
])('it trims %s', (_title, message, expected) => {
  expect(buildTrimmedMessage(message)).toStrictEqual(expected);
});
