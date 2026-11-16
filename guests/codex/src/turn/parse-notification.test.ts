import { expect, test } from 'bun:test';
import { parseNotification } from './parse-notification';

test('it reads a turn that completed with its status', () => {
  expect(
    parseNotification('turn/completed', { threadId: 't', turn: { id: 'u', status: 'completed' } }),
  ).toStrictEqual({
    method: 'turn/completed',
    params: { turn: { id: 'u', status: 'completed' } },
  });
});

test('it gives null for a notification that a turn does not act on', () => {
  expect(parseNotification('turn/started', { threadId: 't' })).toBeNull();
});

test('it gives null for a notification whose params the CLI changed', () => {
  expect(parseNotification('turn/completed', { turn: { id: 7 } })).toBeNull();
});
