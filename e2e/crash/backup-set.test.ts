import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { backupJobEntry, createStubRestic } from '@heynixie/backup-job/test-utils';
import { $ } from 'bun';
import { startSpawnedNixie } from '../test-utils/start-spawned-nixie';

async function setupTest() {
  const nixie = await startSpawnedNixie({ backups: true });
  const restic = await createStubRestic(nixie.directory);

  const jobEnv = {
    NIXIE_BACKUP_STAGING_DIR: join(nixie.dataDir, 'backup'),
    NIXIE_BACKUP_RESTIC: restic,
    NIXIE_BACKUP_DATA_REPOSITORY: join(nixie.directory, 'repos', 'data'),
    NIXIE_BACKUP_DATA_PASSWORD: 'data-pass',
    NIXIE_BACKUP_KEY_REPOSITORY: join(nixie.directory, 'repos', 'keys'),
    NIXIE_BACKUP_KEY_PASSWORD: 'key-pass',
    STUB_RESTIC_LOG: join(nixie.directory, 'restic-calls.jsonl'),
  };

  return { nixie, jobEnv };
}

test('it ships no set that nixie was killed while copying, and a restart replaces it with a set the job ships and nixie records', async () => {
  const ctx = await setupTest();

  const killed = ctx.nixie.harness.start([{ point: 'backup.set.copied', kind: 'backup' }]);

  await killed.waitForArrival('backup.set.copied');
  await killed.kill();

  const leftBehind = await readdir(join(ctx.nixie.dataDir, 'backup', '000000000001'));

  const afterKill = await $`${process.execPath} ${backupJobEntry} run`
    .env(ctx.jobEnv)
    .nothrow()
    .quiet();

  const isResticCalled = await Bun.file(ctx.jobEnv.STUB_RESTIC_LOG).exists();

  const restarted = ctx.nixie.harness.start();

  await restarted.ready;

  await restarted.waitForLogEvent('backup.set_staged');

  const afterRestart = await $`${process.execPath} ${backupJobEntry} run`
    .env(ctx.jobEnv)
    .nothrow()
    .quiet();

  await ctx.nixie.harness.advance(60_000);
  await restarted.waitForLogEvent('backup.set_published');

  const staging = await readdir(join(ctx.nixie.dataDir, 'backup'));
  const sets = await ctx.nixie.readRows('backup_sets');

  expect(leftBehind).toIncludeSameMembers(['nixie.db', 'keys.db']);
  expect(afterKill.exitCode).toBe(0);
  expect(isResticCalled).toBeFalse();
  expect(afterRestart.exitCode).toBe(0);
  expect(afterRestart.stdout.toString()).toInclude('"sequence":2');
  expect(staging).toStrictEqual(['job.lock']);

  expect(sets).toMatchObject([
    { sequence: 1, kind: 'scheduled', state: 'abandoned' },
    { sequence: 2, kind: 'scheduled', state: 'published' },
  ]);
});
