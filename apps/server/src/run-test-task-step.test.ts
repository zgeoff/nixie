import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { buildTestClock } from '@heynixie/testing';
import { runTestTaskStep } from './run-test-task-step';
import { buildMockStepInput } from './test-utils/build-mock-step-input';

test('it reads the inbox, waits, and sets a timer an hour out on the first step', () => {
  const clock = buildTestClock(1_000_000);

  const result = runTestTaskStep(
    clock,
    buildMockStepInput({
      taskID: 'water-the-ferns',
      inbox: [buildMockLogRecord({ sequence: 7 }), buildMockLogRecord({ sequence: 9 })],
      sessionBoundary: null,
    }),
  );

  expect(result).toStrictEqual({
    next: 'wait',
    records: [
      {
        kind: 'test.inbox_read',
        definitions: { snapshotHash: 'sha256:test' },
        payload: { taskID: 'water-the-ferns', sequences: [7, 9] },
      },
    ],
    acknowledged: [7, 9],
    sessionBoundary: 'timer-set',
    timers: [{ dueAt: 4_600_000 }],
  });
});

test('it finishes on an inbox record that asks it to, and sets no timer after the first step', () => {
  const clock = buildTestClock(1_000_000);

  const result = runTestTaskStep(
    clock,
    buildMockStepInput({
      taskID: 'water-the-ferns',
      inbox: [buildMockLogRecord({ sequence: 12, payload: { finish: true } })],
      sessionBoundary: 'timer-set',
    }),
  );

  expect(result).toStrictEqual({
    next: 'done',
    records: [
      {
        kind: 'test.inbox_read',
        definitions: { snapshotHash: 'sha256:test' },
        payload: { taskID: 'water-the-ferns', sequences: [12] },
      },
    ],
    acknowledged: [12],
    sessionBoundary: 'timer-set',
  });
});
