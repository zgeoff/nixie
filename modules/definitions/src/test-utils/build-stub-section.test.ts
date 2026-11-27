import { expect, test } from 'bun:test';
import { buildStubSection } from './build-stub-section';

test('it applies the count of its file', () => {
  const parsed = buildStubSection().parse(new Map([['extras/extras.yaml', 'count: 5\n']]));

  expect(parsed).toStrictEqual({
    value: { count: 5 },
    problems: [],
    paths: new Set(['extras/extras.yaml']),
  });
});

test('it leaves a file with a fault unapplied and reports it', () => {
  const parsed = buildStubSection().parse(new Map([['extras/extras.yaml', 'count: -3\n']]));

  expect(parsed).toStrictEqual({
    value: null,
    problems: [{ path: 'extras/extras.yaml', reason: expect.any(String) }],
    paths: new Set(),
  });
});

test('it reads its value back from the stored form', () => {
  expect(buildStubSection().parseForm({ extras: { count: 7 } })).toStrictEqual({ count: 7 });
});

test('it reads no value from a form without its key', () => {
  expect(buildStubSection().parseForm({ tasks: [] })).toBeNull();
});
