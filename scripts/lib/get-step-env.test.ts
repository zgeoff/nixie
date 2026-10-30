import { expect, test } from 'bun:test';
import { getStepEnv } from './get-step-env.ts';

test('it returns the value the step sets', () => {
  expect(getStepEnv({ TAG: 'v1.4.0' }, 'TAG')).toBe('v1.4.0');
});

test('it returns an empty value as an input', () => {
  expect(getStepEnv({ TAG: '' }, 'TAG')).toBe('');
});

test('it throws, naming the variable, when the step leaves it out', () => {
  expect(() => getStepEnv({}, 'TAG')).toThrowWithMessage(Error, 'the step sets no TAG in its env');
});
