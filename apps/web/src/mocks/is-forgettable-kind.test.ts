import { expect, test } from 'bun:test';
import { isForgettableKind } from './is-forgettable-kind';

test.each([
  ['owner_message', true],
  ['model.reply', true],
  ['tool_called', true],
  ['tool_result', true],
  ['moment_kept', false],
  ['memory.self_note_flagged', false],
  ['model.turn_ended', false],
])('it answers %s with %p', (kind, expected) => {
  expect(isForgettableKind(kind)).toBe(expected);
});
