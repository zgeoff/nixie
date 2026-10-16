import { expect, test } from 'bun:test';
import { isInboxRecord } from './is-inbox-record';

test.each([
  ['owner_message', 'conversation', true],
  ['timer.fired', 'task-1', true],
  ['action.outcome', 'task-1', true],
  ['task.wake', 'memory-writer', true],
  ['turn_finished', 'task-1', false],
  ['task.step_committed', 'task-1', false],
  ['owner_message', null, false],
] as const)('it reads a %s record on thread %s as inbox: %p', (kind, thread, expected) => {
  expect(isInboxRecord({ kind, thread })).toBe(expected);
});

test('it reads a record of a kind no module registered as outside the inbox', () => {
  expect(
    isInboxRecord({
      // @ts-expect-error -- a misspelled kind is no registered kind, so it fails type-checking
      kind: 'timer.fird',
      thread: 'task-1',
    }),
  ).toBe(false);
});
