import { expect, test } from 'bun:test';
import { formatTaskState } from './format-task-state';

test.each([
  ['ready', 'Ready'],
  ['running', 'Running'],
  ['waiting', 'Waiting'],
  ['paused', 'Paused'],
  ['stopped', 'Stopped'],
  ['failed', 'Failed'],
  ['done', 'Done'],
  ['closed', 'Closed'],
] as const)('it labels a %s task %s', (state, expected) => {
  expect(formatTaskState(state)).toBe(expected);
});
