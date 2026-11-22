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

test.each([
  ['an approval that queued an action', { answer: 'approved', actionID: 'a-1' }, false],
  ['an approval that queued nothing', { answer: 'approved' }, true],
  ['a decline', { answer: 'declined' }, true],
] as const)('it reads %s as waking: %p', (_name, answer, expected) => {
  const payload = { proposalID: 'p-1', shortID: 'k3vq8m2xpa', ...answer };

  expect(isWakingRecord({ kind: 'policy.action_answered', thread: 'task-1', payload })).toBe(
    expected,
  );
});
