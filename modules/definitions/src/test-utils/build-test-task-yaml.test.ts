import { expect, test } from 'bun:test';
import { buildTestTaskYaml } from './build-test-task-yaml';

test('it builds the weekly schedule of the tomatoes', () => {
  expect(buildTestTaskYaml()).toBe(`name: Water the tomatoes
brief: Water the tomatoes.
trigger:
  schedule:
    repeat:
      frequency: weekly
      byDay: [fri]
      at: ["08:00"]
      starts: "2026-11-20"
`);
});

test('it takes the brief that the caller names', () => {
  expect(buildTestTaskYaml({ brief: 'Soak them.' })).toContain('brief: Soak them.\ntrigger:');
});

test('it disables the task when the caller names it so', () => {
  expect(buildTestTaskYaml({ isEnabled: false })).toContain('enabled: false\n');
});
