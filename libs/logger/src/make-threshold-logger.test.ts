import { expect, mock, test } from 'bun:test';
import { makeThresholdLogger } from './make-threshold-logger';
import type { Logger } from './types';

test('it writes an event at the threshold', () => {
  const log = mock<Logger>();

  makeThresholdLogger(log, 'warn')('start.retry', { attempt: 2 }, 'warn');

  expect(log.mock.calls).toStrictEqual([['start.retry', { attempt: 2 }, 'warn']]);
});

test('it writes no event below the threshold', () => {
  const log = mock<Logger>();

  makeThresholdLogger(log, 'warn')('start.retry', { attempt: 2 }, 'info');

  expect(log.mock.calls).toStrictEqual([]);
});

test('it writes an event above the threshold', () => {
  const log = mock<Logger>();

  makeThresholdLogger(log, 'info')('runner.failed', { error: 'RangeError' }, 'error');

  expect(log.mock.calls).toStrictEqual([['runner.failed', { error: 'RangeError' }, 'error']]);
});

test('it writes a call that names no level at the info threshold', () => {
  const log = mock<Logger>();

  makeThresholdLogger(log, 'info')('writer.started', { epoch: 4 });

  expect(log.mock.calls).toStrictEqual([['writer.started', { epoch: 4 }, 'info']]);
});

test('it writes no call that names no level above the info threshold', () => {
  const log = mock<Logger>();

  makeThresholdLogger(log, 'warn')('writer.started', { epoch: 4 });

  expect(log.mock.calls).toStrictEqual([]);
});
