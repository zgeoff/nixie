import { expect, test } from 'bun:test';
import { canMovePromptApproval } from './can-move-prompt-approval';

test.each([
  ['current', 'superseded', true],
  ['current', 'current', false],
  ['superseded', 'current', false],
  ['superseded', 'superseded', false],
] as const)('it answers whether a %s approval can become %s with %p', (from, to, expected) => {
  expect(canMovePromptApproval(from, to)).toBe(expected);
});
