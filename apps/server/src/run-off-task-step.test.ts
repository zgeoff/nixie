import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { runOffTaskStep } from './run-off-task-step';
import { buildMockStepInput } from './test-utils/build-mock-step-input';

test('it reads every inbox record of a task that is off, writes nothing and waits', async () => {
  const input = buildMockStepInput({
    taskID: 'memory-writer',
    inbox: [
      buildMockLogRecord({ sequence: 41, kind: 'task.wake', thread: 'memory-writer' }),
      buildMockLogRecord({ sequence: 57, kind: 'timer.fired', thread: 'memory-writer' }),
    ],
  });

  const result = await runOffTaskStep(input);

  expect(result).toStrictEqual({ next: 'wait', records: [], acknowledged: [41, 57] });
});
