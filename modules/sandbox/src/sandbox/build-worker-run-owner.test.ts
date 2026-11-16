import { expect, test } from 'bun:test';
import { buildWorkerRunOwner } from './build-worker-run-owner';

test('it builds the owner of a worker run from its UUID under the worker_run prefix', () => {
  expect(buildWorkerRunOwner('0d9c6a52-3f5e-4b6a-9a52-2f0f4f2b7c11')).toBe(
    'worker_run:0d9c6a52-3f5e-4b6a-9a52-2f0f4f2b7c11',
  );
});
