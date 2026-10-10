import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { sql } from 'kysely';
import { logProjections } from '../log-projections';
import { startTestLog } from './start-test-log';

test('it starts a writer on a fresh data directory with the log projections', async () => {
  const started = await startTestLog();

  const names = await readdir(started.dataDir);
  const tables = await sql<{ name: string }>`select name from sqlite_schema
    where type = 'table' and name = 'records'`.execute(started.writer.db);

  expect(names).toIncludeAllMembers(['keys.db', 'nixie.db']);
  expect(tables.rows).toStrictEqual([{ name: 'records' }]);
  expect(started.log.writer).toBe(started.writer);
  expect(started.log.projections).toBe(logProjections);
  expect(started.log.deploymentKey.algorithm.name).toBe('AES-KW');
});

test('it removes the data directory once the test finishes', async () => {
  const started = await startTestLog();

  onTestFinished(() => {
    expect(existsSync(started.dataDir)).toBeFalse();
  });

  expect(existsSync(started.dataDir)).toBeTrue();
});
