import { expect, test } from 'bun:test';
import { pickListedTaskState } from './pick-listed-task-state';

test.each([
  ['waiting', { state: 'waiting', waitingOn: 'conversation', lastSentKind: 'question' }],
  ['finished', { state: 'waiting', lastSentKind: 'report' }],
  ['idle', { state: 'waiting', lastSentKind: 'progress' }],
  ['idle', { state: 'waiting', lastSentKind: null }],
  ['running', { state: 'running', lastSentKind: 'report' }],
  ['done', { state: 'done', lastSentKind: null }],
] as const)('it lists the task as %s for %o', (expected, task) => {
  expect(pickListedTaskState(task)).toBe(expected);
});
