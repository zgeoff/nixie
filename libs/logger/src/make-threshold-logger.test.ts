import { expect, test } from 'bun:test';
import { makeLogger } from './make-logger';
import { makeThresholdLogger } from './make-threshold-logger';

test('it writes an event at the threshold', () => {
  const lines: string[] = [];

  const log = makeThresholdLogger(
    makeLogger(
      (line) => {
        lines.push(line);
      },
      () => Date.UTC(2026, 9, 11, 12, 0, 0),
    ),
    'warn',
  );

  log('start.retry', { attempt: 2 }, 'warn');

  expect(lines.map((line) => JSON.parse(line) as unknown)).toMatchObject([
    { time: '2026-10-11T12:00:00.000Z', event: 'start.retry', level: 'warn', attempt: 2 },
  ]);
});

test('it writes no event below the threshold', () => {
  const lines: string[] = [];

  const log = makeThresholdLogger(
    makeLogger(
      (line) => {
        lines.push(line);
      },
      () => Date.UTC(2026, 9, 11, 12, 0, 0),
    ),
    'warn',
  );

  log('start.retry', { attempt: 2 }, 'info');

  expect(lines).toStrictEqual([]);
});

test('it writes an event above the threshold', () => {
  const lines: string[] = [];

  const log = makeThresholdLogger(
    makeLogger(
      (line) => {
        lines.push(line);
      },
      () => Date.UTC(2026, 9, 11, 12, 0, 0),
    ),
    'info',
  );

  log('runner.failed', { error: 'RangeError' }, 'error');

  expect(lines.map((line) => JSON.parse(line) as unknown)).toMatchObject([
    { time: '2026-10-11T12:00:00.000Z', event: 'runner.failed', level: 'error' },
  ]);
});

test('it writes a call that names no level at the info threshold', () => {
  const lines: string[] = [];

  const log = makeThresholdLogger(
    makeLogger(
      (line) => {
        lines.push(line);
      },
      () => Date.UTC(2026, 9, 11, 12, 0, 0),
    ),
    'info',
  );

  log('writer.started', { epoch: 4 });

  expect(lines).toStrictEqual([
    '{"time":"2026-10-11T12:00:00.000Z","event":"writer.started","epoch":4}\n',
  ]);
});

test('it writes no call that names no level above the info threshold', () => {
  const lines: string[] = [];

  const log = makeThresholdLogger(
    makeLogger(
      (line) => {
        lines.push(line);
      },
      () => Date.UTC(2026, 9, 11, 12, 0, 0),
    ),
    'warn',
  );

  log('writer.started', { epoch: 4 });

  expect(lines).toStrictEqual([]);
});
