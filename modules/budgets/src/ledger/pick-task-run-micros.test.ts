import { expect, test } from 'bun:test';
import { pickTaskRunMicros } from './pick-task-run-micros';

test('it counts the last count less the count at the start of the task run', () => {
  const micros = pickTaskRunMicros(
    [
      { sandbox: 's1', reason: 'run_start', countMicros: 500_000 },
      { sandbox: 's1', reason: 'step_start', countMicros: 500_000 },
      { sandbox: 's1', reason: 'step_end', countMicros: 730_000 },
    ],
    0,
  );

  expect(micros).toBe(230_000);
});

test('it counts a sandbox first read after the start of the task run from zero', () => {
  const micros = pickTaskRunMicros(
    [
      { sandbox: 's1', reason: 'run_start', countMicros: 500_000 },
      { sandbox: 's1', reason: 'step_end', countMicros: 600_000 },
      { sandbox: 's2', reason: 'step_start', countMicros: 0 },
      { sandbox: 's2', reason: 'step_end', countMicros: 40_000 },
    ],
    0,
  );

  expect(micros).toBe(140_000);
});

test('it keeps the largest count when a read lands out of order', () => {
  const micros = pickTaskRunMicros(
    [
      { sandbox: 's1', reason: 'run_start', countMicros: 0 },
      { sandbox: 's1', reason: 'step_end', countMicros: 900_000 },
      { sandbox: 's1', reason: 'step_end', countMicros: 400_000 },
    ],
    0,
  );

  expect(micros).toBe(900_000);
});

test('it adds the dollars of the worker runs, rounded up to the micro', () => {
  const micros = pickTaskRunMicros(
    [{ sandbox: 's1', reason: 'run_start', countMicros: 0 }],
    0.0000011,
  );

  expect(micros).toBe(2);
});

test('it counts nothing for a task run with no read and no worker', () => {
  expect(pickTaskRunMicros([], 0)).toBe(0);
});
