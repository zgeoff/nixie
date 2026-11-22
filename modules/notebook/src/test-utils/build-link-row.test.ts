import { expect, test } from 'bun:test';
import { buildLinkRow } from './build-link-row';

test('it builds a cites link to a memory item that takes overrides', () => {
  expect(buildLinkRow({ type: 'related' })).toMatchObject({
    type: 'related',
    target_kind: 'memory',
  });
});
