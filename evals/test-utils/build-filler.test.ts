import { expect, test } from 'bun:test';
import { buildFiller } from './build-filler';

test('it builds one numbered line for each 30 tokens asked, rounded up', () => {
  expect(buildFiller(61, 'note')).toBe(
    [
      'note line 000000: the tide gauge read 0 cm and the gulls counted 0.',
      'note line 000001: the tide gauge read 37 cm and the gulls counted 13.',
      'note line 000002: the tide gauge read 74 cm and the gulls counted 26.',
    ].join('\n'),
  );
});

test('it builds lines that never repeat', () => {
  const lines = buildFiller(30_000, 'page 2').split('\n');

  expect(new Set(lines).size).toBe(1000);
});
