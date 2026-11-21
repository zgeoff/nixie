import { expect, test } from 'bun:test';
import { basename, dirname } from 'node:path';
import { readBackupJobBundle } from './read-backup-job-bundle';

test('it returns the backup job bundle in the run’s template, the same for each caller', async () => {
  const paths = await Promise.all([readBackupJobBundle(), readBackupJobBundle()]);
  const isBuilt = await Bun.file(paths[0]).exists();

  expect(paths[1]).toBe(paths[0]);
  expect(basename(dirname(paths[0] ?? ''))).toStartWith('nixie-backup-job-');
  expect(paths[0]).toEndWith('/main.js');
  expect(isBuilt).toBeTrue();
});
