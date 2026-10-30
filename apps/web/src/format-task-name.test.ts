import { expect, test } from 'bun:test';
import { formatTaskName } from './format-task-name';
import { buildMockListedTask } from './test-utils/build-mock-listed-task';

test('it names a listed task by its name', () => {
  const tasks = [buildMockListedTask({ name: 'Garden plan', taskID: 'k3vq8m2xpa' })];

  expect(formatTaskName(tasks, 'k3vq8m2xpa')).toBe('Garden plan');
});

test('it names a task the list does not hold by its ID', () => {
  expect(formatTaskName([], 'k3vq8m2xpa')).toBe('task k3vq8m2xpa');
});
