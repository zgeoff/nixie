import { expect, test } from 'bun:test';
import { canMoveSkillExport } from './can-move-skill-export';

test.each([
  ['opened', 'opened', true],
  ['opened', 'closed', true],
  ['closed', 'opened', false],
  ['closed', 'closed', false],
] as const)('it answers a move from %s to %s with %p', (from, to, expected) => {
  expect(canMoveSkillExport(from, to)).toBe(expected);
});
