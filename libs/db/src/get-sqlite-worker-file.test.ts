import { expect, test } from 'bun:test';
import { getSqliteWorkerFile } from './get-sqlite-worker-file';

test('it starts the source worker from the workspace', () => {
  expect(getSqliteWorkerFile('file:///repo/libs/db/src/build-sqlite-worker-dialect.ts')).toBe(
    'sqlite-worker.ts',
  );
});

test('it starts the bundled worker beside the release bundle', () => {
  expect(getSqliteWorkerFile('file:///app/main.js')).toBe('sqlite-worker.js');
});
