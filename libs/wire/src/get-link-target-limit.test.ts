import { expect, test } from 'bun:test';
import { getLinkTargetLimit } from './get-link-target-limit';

test('it gives the link targets four times the bytes of the text limit', () => {
  expect(getLinkTargetLimit(20_000)).toBe(80_000);
});
