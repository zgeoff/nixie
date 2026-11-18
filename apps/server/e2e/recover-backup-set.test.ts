import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getBackupStagingDir } from '@heynixie/backup';
import { createStubRestic } from '@heynixie/backup-job/test-utils';
import { startE2ENixie } from '@heynixie/server/test-utils';
import { getBackupSetDir } from '@heynixie/wire';
import { resolveProgram } from '@zgeoff/rig/e2e';
import { run } from '@zgeoff/testing/process';

async function setupTest() {
  const nixie = await startE2ENixie({ backups: true });
  const restic = await createStubRestic(nixie.directory);
  const job = await resolveProgram('backup-job');

  const jobEnv = {
    NIXIE_BACKUP_STAGING_DIR: getBackupStagingDir(nixie.dataDir),
    NIXIE_BACKUP_RESTIC: restic,
    NIXIE_BACKUP_DATA_REPOSITORY: join(nixie.directory, 'repos', 'data'),
    NIXIE_BACKUP_DATA_PASSWORD: 'data-pass',
    NIXIE_BACKUP_KEY_REPOSITORY: join(nixie.directory, 'repos', 'keys'),
    NIXIE_BACKUP_KEY_PASSWORD: 'key-pass',
    STUB_RESTIC_LOG: join(nixie.directory, 'restic-calls.jsonl'),
  };

  return { nixie, job, jobEnv };
}

test('it ships no set that nixie was killed while copying, and a restart replaces it with a set the job ships and nixie records', async () => {
  const ctx = await setupTest();

  const killed = ctx.nixie.harness.start([{ point: 'backup.set.copied', kind: 'backup' }]);

  await killed.waitForArrival('backup.set.copied');
  await killed.kill();

  const leftBehind = await readdir(getBackupSetDir(ctx.jobEnv.NIXIE_BACKUP_STAGING_DIR, 1));

  const afterKill = await run(ctx.job.command, {
    args: ['run'],
    cwd: ctx.job.cwd,
    env: ctx.jobEnv,
  });

  const isResticCalled = await Bun.file(ctx.jobEnv.STUB_RESTIC_LOG).exists();

  const restarted = ctx.nixie.harness.start();

  await restarted.ready;

  await restarted.waitForLogEvent('backup.set_staged');

  const afterRestart = await run(ctx.job.command, {
    args: ['run'],
    cwd: ctx.job.cwd,
    env: ctx.jobEnv,
  });

  await ctx.nixie.harness.advance(60_000);
  await restarted.waitForLogEvent('backup.set_published');

  const staging = await readdir(ctx.jobEnv.NIXIE_BACKUP_STAGING_DIR);
  const sets = await ctx.nixie.readBackupSets();

  expect(leftBehind).toIncludeSameMembers(['nixie.db', 'keys.db']);
  expect(afterKill.exitCode).toBe(0);
  expect(isResticCalled).toBeFalse();
  expect(afterRestart.exitCode).toBe(0);
  expect(afterRestart.stdout).toInclude('"sequence":2');
  expect(staging).toStrictEqual(['job.lock']);

  expect(sets).toStrictEqual([
    { sequence: 1, kind: 'scheduled', state: 'abandoned' },
    { sequence: 2, kind: 'scheduled', state: 'published' },
  ]);
});
