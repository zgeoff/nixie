import { expect, test } from 'bun:test';
import { parseLinkedMessage } from './parse-linked-message';

test.each([
  ['task-message-m7q2x9k4pa', 'm7q2x9k4pa'],
  ['task-message-', undefined],
  ['', undefined],
  ['footnote-1', undefined],
])('it parses the fragment %p as the message %p', (hash, expected) => {
  expect(parseLinkedMessage(hash)).toBe(expected);
});
