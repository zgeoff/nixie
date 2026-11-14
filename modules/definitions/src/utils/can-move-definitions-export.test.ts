import { expect, test } from 'bun:test';
import { canMoveDefinitionsExport } from './can-move-definitions-export';

test.each([
  ['exporting', 'exporting', true],
  ['exporting', 'opened', true],
  ['exporting', 'closed', true],
  ['opened', 'exporting', true],
  ['opened', 'opened', false],
  ['opened', 'closed', true],
  ['closed', 'exporting', false],
  ['closed', 'opened', false],
  ['closed', 'closed', false],
] as const)('it answers a move from %s to %s with %p', (from, to, expected) => {
  expect(canMoveDefinitionsExport(from, to)).toBe(expected);
});
