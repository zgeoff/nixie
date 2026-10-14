import { expect, test } from 'bun:test';
import { pickLeastTrustedSource } from './pick-least-trusted-source';

test.each([
  [['owner', 'owner'], 'owner'],
  [['owner', 'owner_data'], 'owner_data'],
  [['owner_data', 'owner', 'untrusted'], 'untrusted'],
  [['untrusted'], 'untrusted'],
] as const)('it picks from %p the source %p', (sources, expected) => {
  expect(pickLeastTrustedSource(sources)).toBe(expected);
});
