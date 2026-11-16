import { expect, test } from 'bun:test';
import { buildRecallResult } from './build-recall-result';

test('it builds a recall-shaped result of exactly the bytes asked for', () => {
  const result = buildRecallResult(20_000);

  expect(Buffer.byteLength(result)).toBe(20_000);
});

test('it builds a result that parses as items beside a filler', () => {
  const parsed: unknown = JSON.parse(buildRecallResult(20_000));

  expect(parsed).toStrictEqual({
    items: expect.toBeArrayOfSize(60),
    filler: expect.toStartWith('xxxx'),
    next: null,
    searched: {},
  });
});
