import { expect, test } from 'bun:test';
import { findNewTaskID } from './find-new-task-id.ts';

test('it returns the one task that was not known before the turn', () => {
  expect(
    findNewTaskID(['task-harbour'], [{ taskID: 'task-harbour' }, { taskID: 'task-tide' }]),
  ).toBe('task-tide');
});

test('it returns undefined when the turn started no task', () => {
  expect(findNewTaskID(['task-harbour'], [{ taskID: 'task-harbour' }])).toBeUndefined();
});
