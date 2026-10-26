import { expect, test } from 'bun:test';
import { canMoveMoment } from './can-move-moment';

test.each([
  ['active', 'retired', true],
  ['active', 'destroying', true],
  ['active', 'active', false],
  ['active', 'destroyed', false],
  ['retired', 'active', true],
  ['retired', 'destroying', true],
  ['retired', 'retired', false],
  ['retired', 'destroyed', false],
  ['destroying', 'destroyed', true],
  ['destroying', 'active', false],
  ['destroying', 'retired', false],
  ['destroying', 'destroying', false],
  ['destroyed', 'active', false],
  ['destroyed', 'retired', false],
  ['destroyed', 'destroying', false],
  ['destroyed', 'destroyed', false],
] as const)('it answers whether a %s moment moves to %s: %p', (from, to, isAllowed) => {
  expect(canMoveMoment(from, to)).toBe(isAllowed);
});
