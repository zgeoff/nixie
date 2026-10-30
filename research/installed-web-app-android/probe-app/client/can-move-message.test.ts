import { expect, test } from 'bun:test';
import { canMoveMessage, type MessageState } from './can-move-message.ts';

test.each<[MessageState | 'absent', MessageState, boolean]>([
  ['absent', 'queued', true],
  ['queued', 'sent', true],
  ['queued', 'refused', true],
  ['absent', 'sent', false],
  ['absent', 'refused', false],
  ['queued', 'queued', false],
  ['sent', 'queued', false],
  ['sent', 'refused', false],
  ['refused', 'queued', false],
  ['refused', 'sent', false],
])('it judges a move from %s to %s allowed: %p', (from, to, expected) => {
  expect(canMoveMessage(from, to)).toBe(expected);
});
