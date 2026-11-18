import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { getBackupStagingDir } from '@heynixie/backup';
import { createStubRestic } from '@heynixie/backup-job/test-utils';
import { runHostCommand, startE2ENixie } from '@heynixie/server/test-utils';
import { waitForCondition } from '@heynixie/testing';
import {
  backupReceiptSchema,
  backupSetLayout,
  getBackupSetDir,
  parseBackupFile,
} from '@heynixie/wire';
import { resolveProgram } from '@zgeoff/rig/e2e';
import { run } from '@zgeoff/testing/process';
import invariant from 'tiny-invariant';

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
  };

  return { nixie, job, jobEnv };
}

test('it stages a set at once that the job ships and nixie records as published', async () => {
  const ctx = await setupTest();

  const server = ctx.nixie.harness.start();

  await server.ready;

  await server.waitForLogEvent('backup.set_staged');

  const firstRun = await run(ctx.job.command, { args: ['run'], cwd: ctx.job.cwd, env: ctx.jobEnv });
  const stage = await runHostCommand(ctx.nixie.configPath, ['stage-backup']);

  const secondRun = await run(ctx.job.command, {
    args: ['run'],
    cwd: ctx.job.cwd,
    env: ctx.jobEnv,
  });

  const receiptText = await Bun.file(
    join(getBackupSetDir(ctx.jobEnv.NIXIE_BACKUP_STAGING_DIR, 2), backupSetLayout.receipt),
  ).text();

  const receipt = parseBackupFile(receiptText, backupReceiptSchema);

  invariant('value' in receipt, 'the job writes a receipt that parses');

  await ctx.nixie.harness.advance(60_000);

  await waitForCondition(async () => {
    const sets = await ctx.nixie.readBackupSets();

    return sets.every((set) => set.state === 'published');
  });

  const sets = await ctx.nixie.readBackupSets();

  expect(firstRun.exitCode).toBe(0);
  expect(stage.exitCode).toBe(0);

  expect(stage.stdout).toBe(
    "nixie staged backup set 2 (scheduled); the backup job's next run ships it\n",
  );

  expect(secondRun.exitCode).toBe(0);
  expect(receipt.value).toMatchObject({ sequence: 2, status: 'published', check: 'passed' });

  expect(sets).toStrictEqual([
    { sequence: 1, kind: 'scheduled', state: 'published' },
    { sequence: 2, kind: 'scheduled', state: 'published' },
  ]);
});

test('it refuses while the job has not shipped the set that waits', async () => {
  const ctx = await setupTest();

  const server = ctx.nixie.harness.start();

  await server.ready;

  await server.waitForLogEvent('backup.set_staged');

  const stage = await runHostCommand(ctx.nixie.configPath, ['stage-backup']);

  expect(stage.exitCode).toBe(1);

  expect(stage.logged).toStrictEqual([
    {
      event: 'command.failed',
      command: 'stage-backup',
      error: 'Error',
      message: expect.stringContaining(
        'backup set 1 is staged and the backup job has not shipped it yet',
      ),
    },
  ]);
});
