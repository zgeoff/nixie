import { expect, test } from 'bun:test';
import { pickTailRepair } from './pick-tail-repair.ts';

test.each([
  ['an empty file', ''],
  ['a file whose last line ends with a newline', '{"reservedFor":"case 2/3","reserveUSD":0.1}\n'],
])('it repairs nothing in %s', (_, text) => {
  expect(pickTailRepair(text)).toStrictEqual({ kind: 'none' });
});

test('it adds the newline to a last line that parses', () => {
  expect(
    pickTailRepair(
      '{"reservedFor":"case 2/3","reserveUSD":0.1}\n{"reservedFor":"case 2/4","reserveUSD":0.1}',
    ),
  ).toStrictEqual({ kind: 'add_newline' });
});

test('it cuts a torn last line and keeps the lines before it', () => {
  expect(
    pickTailRepair('{"reservedFor":"case 2/3","reserveUSD":0.1}\n{"caseID":"2/3","bucket":"nat'),
  ).toStrictEqual({ kind: 'cut', keptBytes: 44 });
});

test('it counts the kept length in bytes, not characters', () => {
  expect(pickTailRepair('{"reason":"café"}\n{"reason":"caf')).toStrictEqual({
    kind: 'cut',
    keptBytes: 19,
  });
});

test('it cuts a file that holds only a torn line to nothing', () => {
  expect(pickTailRepair('{"reservedFor":"case')).toStrictEqual({ kind: 'cut', keptBytes: 0 });
});
