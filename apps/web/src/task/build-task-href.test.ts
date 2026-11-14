import { expect, test } from 'bun:test';
import { buildTaskHref } from './build-task-href';

test('it links the conversation to the home page', () => {
  expect(buildTaskHref('conversation')).toBe('/');
});

test('it links a task to its own page', () => {
  expect(buildTaskHref('k3vq8m2xpa')).toBe('/tasks/k3vq8m2xpa');
});

test('it escapes a task ID that holds a slash', () => {
  expect(buildTaskHref('memory/writer')).toBe('/tasks/memory%2Fwriter');
});
