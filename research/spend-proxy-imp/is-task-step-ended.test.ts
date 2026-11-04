import { expect, test } from 'bun:test';
import { isTaskStepEnded } from './is-task-step-ended.ts';

test('it takes a task step that committed with no text reply', () => {
  expect(isTaskStepEnded({ lastStepEnd: { sequence: 4 } })).toBeTrue();
});

test('it reports a task thread with no ended step as not ended', () => {
  expect(isTaskStepEnded({ lastStepEnd: null })).toBeFalse();
});
