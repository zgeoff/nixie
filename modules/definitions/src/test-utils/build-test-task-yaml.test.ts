import { expect, test } from 'bun:test';
import { buildTestTaskYaml } from './build-test-task-yaml';

test('it builds the weekly schedule of a conversation reminder', () => {
  expect(buildTestTaskYaml()).toBe(`name: Water the tomatoes
brief: Water the tomatoes.
target: conversation
trigger:
  schedule:
    every: week
    on: fri
    at: "08:00"
`);
});

test('it takes the brief and the target that the caller names', () => {
  expect(buildTestTaskYaml({ brief: 'Soak them.', target: 'task' })).toContain(
    'brief: Soak them.\ntarget: task\n',
  );
});
