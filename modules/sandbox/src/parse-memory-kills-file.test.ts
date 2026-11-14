import { expect, test } from 'bun:test';
import { parseMemoryKillsFile } from './parse-memory-kills-file';

test.each([
  ['4', 4],
  ['0\n', 0],
  ['  12  ', 12],
])('#parseMemoryKillsFile reads %j as a count of %d', (text, kills) => {
  expect(parseMemoryKillsFile(text)).toStrictEqual({ kind: 'count', kills });
});

test.each([[''], ['-1'], ['1.5'], ['3 kills'], ['abc']])(
  '#parseMemoryKillsFile fails on %j',
  (text) => {
    expect(parseMemoryKillsFile(text)).toStrictEqual({ kind: 'failed' });
  },
);
