import { expect, test } from 'bun:test';
import { pickListedTaskState } from './pick-listed-task-state';

test.each([
  {
    expected: 'running',
    task: { state: 'running', wakeable: true, newestRunEnd: 'reported' },
  },
  {
    expected: 'paused',
    task: { state: 'paused', waitingOn: 'conversation', wakeable: false, newestRunEnd: null },
  },
  {
    expected: 'done',
    task: { state: 'done', wakeable: false, newestRunEnd: null },
  },
  {
    expected: 'waiting',
    task: { state: 'waiting', waitingOn: 'conversation', wakeable: false, newestRunEnd: null },
  },
  {
    expected: 'waiting',
    task: { state: 'waiting', waitingOn: 'conversation', wakeable: true, newestRunEnd: 'reported' },
  },
  {
    expected: 'asleep',
    task: { state: 'waiting', wakeable: false, newestRunEnd: 'reported' },
  },
  {
    expected: 'asleep',
    task: { state: 'waiting', wakeable: false, newestRunEnd: null },
  },
  {
    expected: 'finished',
    task: { state: 'waiting', wakeable: true, newestRunEnd: 'reported' },
  },
  {
    expected: 'idle',
    task: { state: 'waiting', wakeable: true, newestRunEnd: 'quiet' },
  },
  {
    expected: 'idle',
    task: { state: 'waiting', wakeable: true, newestRunEnd: null },
  },
] as const)('it lists a task as $expected for $task', (row) => {
  expect(pickListedTaskState(row.task)).toBe(row.expected);
});

test('it lists a wakeable task whose newest task run reported under the mode none as finished', () => {
  expect(pickListedTaskState({ state: 'waiting', wakeable: true, newestRunEnd: 'reported' })).toBe(
    'finished',
  );
});
