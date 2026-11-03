import { expect, test } from 'bun:test';
import { runUnknownTaskStep } from './run-unknown-task-step';
import { buildMockStepInput } from './test-utils/build-mock-step-input';

test('it fails the step of a task that no runner runs, naming the task', () => {
  const input = buildMockStepInput({ taskID: 'k3vq8m2xpa' });

  expect(runUnknownTaskStep(input)).rejects.toThrowWithMessage(
    Error,
    'no runner runs the task k3vq8m2xpa',
  );
});
