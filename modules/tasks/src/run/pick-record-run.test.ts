import { expect, test } from 'bun:test';
import { buildTestTaskRun } from '../test-utils/build-test-task-run';
import { pickRecordRun } from './pick-record-run';

test("it picks the task run that a record names, even when the record sits in another run's span", () => {
  const first = buildTestTaskRun({ runID: 'run-a', openedSequence: 10 });
  const second = buildTestTaskRun({ runID: 'run-b', openedSequence: 30 });

  expect(pickRecordRun({ sequence: 35, taskRunID: 'run-a' }, [first, second])?.runID).toBe('run-a');
});

test('it picks no task run for a record that names one the task lacks', () => {
  expect(pickRecordRun({ sequence: 35, taskRunID: 'run-x' }, [buildTestTaskRun()])).toBeNull();
});

test('it picks the newest task run that opened at or before a record that names none', () => {
  const first = buildTestTaskRun({ runID: 'run-a', openedSequence: 10 });
  const second = buildTestTaskRun({ runID: 'run-b', openedSequence: 30 });

  expect(pickRecordRun({ sequence: 31 }, [first, second])?.runID).toBe('run-b');
});

test('it picks the task run that the waking input opened it for, though the input sits before the claim', () => {
  const first = buildTestTaskRun({ runID: 'run-a', openedSequence: 10, originSequence: 8 });

  expect(pickRecordRun({ sequence: 8 }, [first])?.runID).toBe('run-a');
});

test('it picks no task run for a record before the first one opened', () => {
  expect(pickRecordRun({ sequence: 3 }, [buildTestTaskRun()])).toBeNull();
});
