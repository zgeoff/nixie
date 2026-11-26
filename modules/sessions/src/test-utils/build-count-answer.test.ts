import { expect, test } from 'bun:test';
import { buildCountAnswer } from './build-count-answer';

test('it answers a read with the dollars and no refusal', () => {
  expect(buildCountAnswer(0.5)).toStrictEqual({
    kind: 'ok',
    value: { dollars: 0.5, tokens: 0, tripped: false, lastRefusal: null, limitRevision: 0 },
  });
});

test('it carries the refusal it is given', () => {
  const refusal = { counter: 'sandbox', route: 'router-b', provider: 'main', atMs: 9 } as const;

  expect(buildCountAnswer(1, refusal).value.lastRefusal).toStrictEqual(refusal);
});
