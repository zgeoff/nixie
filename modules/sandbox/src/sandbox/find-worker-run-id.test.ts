import { expect, test } from 'bun:test';
import { findWorkerRunID } from './find-worker-run-id';

test('it finds the worker run UUID in the owner of a worker run', () => {
  expect(findWorkerRunID('worker_run:0d9c6a52-3f5e-4b6a-9a52-2f0f4f2b7c11')).toBe(
    '0d9c6a52-3f5e-4b6a-9a52-2f0f4f2b7c11',
  );
});

test.each(['t4m2', 'conversation', 'checker', 'worker_run'])(
  'it finds no worker run in the owner %s',
  (owner) => {
    expect(findWorkerRunID(owner)).toBeNull();
  },
);
