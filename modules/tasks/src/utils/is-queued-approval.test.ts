import { expect, test } from 'bun:test';
import { isQueuedApproval } from './is-queued-approval';

test.each([
  ['policy.action_answered', { answer: 'approved', actionID: 'a-1' }, true],
  ['policy.action_answered', { answer: 'approved' }, false],
  ['policy.action_answered', { answer: 'declined' }, false],
  ['action.outcome', { answer: 'approved', actionID: 'a-1' }, false],
] as const)('it reads a %s record with %o as a queued approval: %p', (kind, payload, expected) => {
  expect(isQueuedApproval({ kind, payload })).toBe(expected);
});
