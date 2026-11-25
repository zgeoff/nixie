import { expect, test } from 'bun:test';
import { buildGateWork } from './build-gate-work';

test.each([
  ['step-1', 0, false],
  ['step-1', 1, true],
  ['ended:stopped:task-1', 0, true],
  ['ended:stopped:task-1', 1, true],
  ['task-ended:1', 0, false],
] as const)(
  'it counts an action under step key %s with %i attempts as started: %p',
  (stepKey, attempts, expected) => {
    expect(buildGateWork({ step_key: stepKey, attempt_count: attempts })).toStrictEqual({
      isStarted: expected,
    });
  },
);
