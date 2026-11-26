import { expect, test } from 'bun:test';
import { isWakingRecord } from './is-waking-record';

test.each([
  ['owner_message', 'conversation', true],
  ['timer.fired', 'task-1', true],
  ['task.limit_notice', 'conversation', true],
  ['recovery.notice', 'conversation', false],
  ['tool_changed', 'conversation', false],
  ['task.step_committed', 'task-1', false],
  ['owner_message', null, false],
  ['call.started', 'conversation', true],
  ['call.answered', 'conversation', true],
  ['call.ended', 'conversation', true],
  ['call.rang', 'conversation', false],
  ['call.handed_off', 'call-task', true],
  ['call.spoke', 'call-task', false],
  ['call.heard_cut', 'call-task', false],
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

test.each([
  ['a line the speech layer heard', { identityID: 'identity-1', isDictated: true }, false],
  ['a line the owner typed', { identityID: 'identity-1' }, true],
] as const)('it reads an owner_message of %s as waking: %p', (_name, payload, expected) => {
  expect(isWakingRecord({ kind: 'owner_message', thread: 'call-task', payload })).toBe(expected);
});
