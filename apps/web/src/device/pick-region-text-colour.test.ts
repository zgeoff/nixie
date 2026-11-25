import { expect, test } from 'bun:test';
import { pickRegionTextColour } from './pick-region-text-colour';

test.each([
  { background: null, expected: 'white' },
  { background: 'navy', expected: 'white' },
  { background: 'white', expected: 'black' },
  { background: 'yellow', expected: 'black' },
  { background: '#f0f0e0', expected: 'black' },
  { background: '#102030', expected: 'white' },
])('#pickRegionTextColour gives $expected text on $background', (row) => {
  expect(pickRegionTextColour(row.background)).toBe(row.expected);
});
