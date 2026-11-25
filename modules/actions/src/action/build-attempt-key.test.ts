import { expect, test } from 'bun:test';
import { buildAttemptKey } from './build-attempt-key';

test.each([
  [0, 'action-1'],
  [1, 'action-1.1'],
  [3, 'action-1.3'],
])('it builds the key of an action with %d refused attempts as %s', (refusedCount, key) => {
  expect(buildAttemptKey({ action_id: 'action-1', refused_count: refusedCount })).toBe(key);
});
