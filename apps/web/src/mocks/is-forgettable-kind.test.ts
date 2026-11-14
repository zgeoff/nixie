import { expect, test } from 'bun:test';
import { isForgettableKind } from './is-forgettable-kind';

test.each([
  ['owner_message', true],
  ['model.reply', true],
  ['tool_called', false],
])('it answers %s with %p', (kind, expected) => {
  expect(isForgettableKind(kind)).toBe(expected);
});
