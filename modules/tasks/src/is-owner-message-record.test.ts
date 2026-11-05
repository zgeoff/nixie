import { expect, test } from 'bun:test';
import { isOwnerMessageRecord } from './is-owner-message-record';

test.each([
  { name: 'a message the owner wrote', kind: 'owner_message', payload: {}, isOwner: true },
  {
    name: 'a message the owner moved to the task',
    kind: 'task.message_moved',
    payload: { message: 12, messageThread: 'conversation', from: 'conversation', to: 'q7p2m9x3ka' },
    isOwner: true,
  },
  {
    name: 'the notice that a message moved away from the task',
    kind: 'task.message_moved',
    payload: { message: 12, messageThread: 'q7p2m9x3ka', from: 'q7p2m9x3ka', to: 'conversation' },
    isOwner: false,
  },
  {
    name: 'a task message',
    kind: 'task_message',
    payload: { from: 'conversation', to: 'q7p2m9x3ka', kind: 'report', hop: 1, woke: true },
    isOwner: false,
  },
  { name: 'a fired timer', kind: 'timer.fired', payload: {}, isOwner: false },
])('it answers $isOwner for $name', (row) => {
  expect(isOwnerMessageRecord({ kind: row.kind, thread: 'q7p2m9x3ka', payload: row.payload })).toBe(
    row.isOwner,
  );
});
