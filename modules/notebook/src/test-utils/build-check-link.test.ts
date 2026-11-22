import { expect, test } from 'bun:test';
import { buildCheckLink } from './build-check-link';

test('it builds a cites link to a memory item that takes overrides', () => {
  expect(buildCheckLink('abc', { type: 'disputes' })).toMatchObject({
    fromShortID: 'abc',
    type: 'disputes',
    kind: 'memory',
  });
});
