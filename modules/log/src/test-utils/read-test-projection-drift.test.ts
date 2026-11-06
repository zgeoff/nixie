import { expect, test } from 'bun:test';
import { sql } from 'kysely';
import { writeRecords } from '../write-records';
import { readTestProjectionDrift } from './read-test-projection-drift';
import { startTestLog } from './start-test-log';

function setupTest() {
  return startTestLog();
}

test('it finds no drift in tables that the folds wrote', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'garden' },
    { kind: 'turn_finished', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'garden' },
  ]);

  const drift = await readTestProjectionDrift(ctx.log);

  expect(drift).toStrictEqual([]);
});

test('it names a projection table whose rows differ from a rebuild', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'garden' },
  ]);

  await sql`update threads set record_count = 9`.execute(ctx.writer.db);

  const drift = await readTestProjectionDrift(ctx.log);

  expect(drift).toStrictEqual(['threads']);
});
