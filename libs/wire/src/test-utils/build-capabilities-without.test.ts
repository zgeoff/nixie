import { expect, test } from 'bun:test';
import { buildCapabilitiesWithout } from './build-capabilities-without';

test('it keeps every capability of the Agent SDK but the one it drops', () => {
  const capabilities = buildCapabilitiesWithout('summarize');

  expect([
    capabilities.has('summarize'),
    capabilities.has('resume'),
    capabilities.size,
  ]).toStrictEqual([false, true, 11]);
});
