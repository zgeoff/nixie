import { expect, test } from 'bun:test';
import { isWakingRecord } from './is-waking-record';

test.each([
  ['owner_message', 'conversation', true],
  ['timer.fired', 'task-1', true],
  ['task.limit_notice', 'conversation', true],
  ['recovery.notice', 'conversation', false],
  ['task.step_committed', 'task-1', false],
  ['owner_message', null, false],
] as const)('it reads a %s record on thread %s as waking: %p', (kind, thread, expected) => {
  expect(isWakingRecord({ kind, thread, payload: {} })).toBe(expected);
});
