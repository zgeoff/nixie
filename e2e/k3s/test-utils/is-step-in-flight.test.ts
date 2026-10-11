import { expect, test } from 'bun:test';
import { isStepInFlight } from './is-step-in-flight';

test('it holds while the last step record is a start', () => {
  expect(
    isStepInFlight([
      { kind: 'task.step_committed' },
      { kind: 'task.step_started' },
      { kind: 'tool_called' },
    ]),
  ).toBeTrue();
});

test.each([['task.step_committed'], ['task.step_errored'], ['task.step_interrupted']])(
  'it fails once the last step record is %s',
  (kind) => {
    expect(isStepInFlight([{ kind: 'task.step_started' }, { kind }])).toBeFalse();
  },
);

test('it fails for a thread with no step yet', () => {
  expect(isStepInFlight([{ kind: 'task.created' }])).toBeFalse();
});
