import { expect, test } from 'bun:test';
import { isTaskListRecord } from './is-task-list-record';

test.each([
  ['task.paused', true],
  ['task.step_committed', true],
  ['task_message', true],
  ['action.queued', true],
  ['action.outcome', true],
  ['owner_message', true],
  ['timer.fired', true],
  ['log_reset', true],
  ['model.reply', false],
  ['tool_called', false],
])('it gives %s as %s', (kind, expected) => {
  expect(isTaskListRecord(kind)).toBe(expected);
});
