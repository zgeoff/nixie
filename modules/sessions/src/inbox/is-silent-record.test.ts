import { expect, test } from 'bun:test';
import { isSilentRecord } from './is-silent-record';

test.each([
  ['policy.action_answered', 'conversation', { answer: 'approved', actionID: 'a-1' }, true],
  ['policy.action_answered', 'conversation', { answer: 'declined' }, false],
  ['task.wake', 'conversation', { at: 1, actionID: 'a-1' }, true],
  ['task.wake', 'sweeper', { at: 1 }, false],
  ['trigger.fired', 'sweeper', {}, true],
  ['trigger.fired', 'conversation', {}, false],
  ['action.outcome', 'conversation', { actionID: 'a-1' }, false],
] as const)(
  'it reads a %s record on thread %s with %o as silent: %p',
  (kind, thread, payload, expected) => {
    expect(isSilentRecord({ kind, thread, payload })).toBe(expected);
  },
);
