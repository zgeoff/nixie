import { expect, test } from 'bun:test';
import { isInboxRecord } from './is-inbox-record';

test.each([
  ['owner_message', 'conversation', true],
  ['timer.fired', 'task-1', true],
  ['action.outcome', 'task-1', true],
  ['turn_finished', 'task-1', false],
  ['task.step_committed', 'task-1', false],
  ['owner_message', null, false],
])('it reads a %s record on thread %s as inbox: %p', (kind, thread, expected) => {
  expect(isInboxRecord({ kind, thread })).toBe(expected);
});
