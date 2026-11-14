import { expect, test } from 'bun:test';
import { writeRecords } from '../record/write-records';
import { buildLogSeeder } from './build-log-seeder';
import { readTestProjectionDrift } from './read-test-projection-drift';
import { startTestLog } from './start-test-log';

async function setupTest() {
  const log = await startTestLog();

  return { ...log, seed: buildLogSeeder(log) };
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

  await ctx.seed.driftedThread({ kind: 'owner_message', thread: 'garden' });

  const drift = await readTestProjectionDrift(ctx.log);

  expect(drift).toStrictEqual(['threads']);
});
