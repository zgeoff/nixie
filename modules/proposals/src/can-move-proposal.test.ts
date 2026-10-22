import { expect, test } from 'bun:test';
import { canMoveProposal } from './can-move-proposal';

test.each([
  ['pending', 'approved', true],
  ['pending', 'rejected', true],
  ['pending', 'lapsed', true],
  ['approved', 'rejected', false],
  ['approved', 'lapsed', false],
  ['rejected', 'approved', false],
  ['rejected', 'lapsed', false],
  ['lapsed', 'approved', false],
  ['lapsed', 'rejected', false],
] as const)('it answers whether a %s proposal closes as %s: %p', (from, to, isAllowed) => {
  expect(canMoveProposal(from, to)).toBe(isAllowed);
});
