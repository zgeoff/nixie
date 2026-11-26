import { expect, test } from 'bun:test';
import { parseFencedResult } from './parse-fenced-result';

test('it parses the JSON body of a fenced text block', () => {
  const result = parseFencedResult({
    content: [
      {
        type: 'text',
        text: '<tool-result source="untrusted" fence="3f9a0c21">\n{"stdout":"hi"}\n</tool-result fence="3f9a0c21">',
      },
    ],
  });

  expect(result).toStrictEqual({ stdout: 'hi' });
});

test('it refuses a text block with no fence', () => {
  expect(() => parseFencedResult({ content: [{ type: 'text', text: '{"stdout":"hi"}' }] })).toThrow(
    'the text block is fenced as untrusted',
  );
});

test('it refuses a fence whose closing ID differs from the opening one', () => {
  expect(() =>
    parseFencedResult({
      content: [
        {
          type: 'text',
          text: '<tool-result source="untrusted" fence="3f9a0c21">\n{}\n</tool-result fence="0000">',
        },
      ],
    }),
  ).toThrow('the text block is fenced as untrusted');
});

test('it refuses a result that also carries an unfenced structured copy', () => {
  expect(() =>
    parseFencedResult({
      content: [
        {
          type: 'text',
          text: '<tool-result source="untrusted" fence="3f9a0c21">\n{"stdout":"hi"}\n</tool-result fence="3f9a0c21">',
        },
      ],
      structuredContent: { stdout: 'hi' },
    }),
  ).toThrow('the result holds no unfenced structured copy');
});
