import { expect, test } from 'bun:test';
import { isFeatureOn } from './is-feature-on';

test.each([
  { title: 'unknown', features: null, feature: 'voice' as const, expected: true },
  { title: 'listed', features: ['voice' as const], feature: 'voice' as const, expected: true },
  { title: 'not listed', features: ['mail' as const], feature: 'voice' as const, expected: false },
])('it reads a feature that is $title as on is $expected', (row) => {
  expect(isFeatureOn(row.features, row.feature)).toBe(row.expected);
});
