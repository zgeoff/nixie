import { expect, mock, test } from 'bun:test';
import type { Logger } from '@heynixie/logger';
import { makeStepErrorLogger } from './make-step-error-logger';

test('it logs a step error with its task, step, count, next state and error name', () => {
  const log = mock<Logger>();

  makeStepErrorLogger(log)({
    taskID: 'conversation',
    stepKey: 'conversation:4',
    errors: 2,
    errorLimit: 3,
    nextState: 'ready',
    retryAt: 1_060_000,
    error: new RangeError('the guest exited before it ended its turn'),
  });

  expect(log.mock.calls).toStrictEqual([
    [
      'task.step_errored',
      {
        taskID: 'conversation',
        stepKey: 'conversation:4',
        errors: 2,
        nextState: 'ready',
        retryAt: 1_060_000,
        error: 'RangeError',
      },
    ],
  ]);
});

test('it logs the type of a thrown value that is not an error', () => {
  const log = mock<Logger>();

  makeStepErrorLogger(log)({
    taskID: 'task-1',
    stepKey: 'task-1:3',
    errors: 3,
    errorLimit: 3,
    nextState: 'failed',
    retryAt: 1_030_000,
    error: 'a thrown string',
  });

  expect(log.mock.calls).toStrictEqual([
    [
      'task.step_errored',
      {
        taskID: 'task-1',
        stepKey: 'task-1:3',
        errors: 3,
        nextState: 'failed',
        retryAt: 1_030_000,
        error: 'string',
      },
    ],
  ]);
});
