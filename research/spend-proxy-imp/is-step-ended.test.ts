import { expect, test } from 'bun:test';
import { isStepEnded } from './is-step-ended.ts';

test('it counts a step that ended after the sent message', () => {
  expect(isStepEnded({ lastStepEnd: { sequence: 12 } }, 10)).toBeTrue();
});

test('it ignores a step that ended before the sent message', () => {
  expect(isStepEnded({ lastStepEnd: { sequence: 9 } }, 10)).toBeFalse();
});

test('it reports a thread with no ended step as not ended', () => {
  expect(isStepEnded({ lastStepEnd: null }, 0)).toBeFalse();
});
