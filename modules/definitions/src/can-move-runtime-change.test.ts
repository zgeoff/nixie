import { expect, test } from 'bun:test';
import { canMoveRuntimeChange } from './can-move-runtime-change';

test.each([
  ['in_force', 'adopted', true],
  ['in_force', 'superseded', true],
  ['in_force', 'retired', true],
  ['in_force', 'in_force', false],
  ['adopted', 'in_force', false],
  ['adopted', 'retired', false],
  ['superseded', 'in_force', false],
  ['superseded', 'adopted', false],
  ['retired', 'in_force', false],
  ['retired', 'adopted', false],
] as const)('it answers whether a runtime change %s moves to %s: %p', (from, to, isAllowed) => {
  expect(canMoveRuntimeChange(from, to)).toBe(isAllowed);
});
