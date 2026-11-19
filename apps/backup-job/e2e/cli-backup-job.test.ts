import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimFileLock } from '@heynixie/async';
import { createStagedSet, createStubRestic } from '@heynixie/backup-job/test-utils';
import { backupSetLayout, getBackupSetDir } from '@heynixie/wire';
import { resolveProgram } from '@zgeoff/rig/e2e';
import { run } from '@zgeoff/testing/process';
import invariant from 'tiny-invariant';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-backup-cli-'));

  // Bun runs onTestFinished callbacks in the order they register, so a stack, which unwinds in
  // reverse, releases a lock before the data folder goes
  const cleanup = new AsyncDisposableStack();

  onTestFinished(() => cleanup.disposeAsync());

  cleanup.defer(() => rm(dataDir, { recursive: true, force: true }));

  const restic = await createStubRestic(dataDir);
  const program = await resolveProgram('backup-job');

  return { dataDir, restic, program, cleanup };
}

test('it publishes the staged sets once and exits 0 for run', async () => {
  const ctx = await setupTest();

  await createStagedSet({
    stagingDir: join(ctx.dataDir, 'backup'),
    sequence: 1,
    kind: 'scheduled',
    isComplete: true,
  });

  const result = await run(ctx.program.command, {
    args: ['run'],
    cwd: ctx.program.cwd,
    env: {
      NIXIE_BACKUP_STAGING_DIR: join(ctx.dataDir, 'backup'),
      NIXIE_BACKUP_RESTIC: ctx.restic,
      NIXIE_BACKUP_DATA_REPOSITORY: join(ctx.dataDir, 'repos', 'data'),
      NIXIE_BACKUP_DATA_PASSWORD: 'data-pass',
      NIXIE_BACKUP_KEY_REPOSITORY: join(ctx.dataDir, 'repos', 'keys'),
      NIXIE_BACKUP_KEY_PASSWORD: 'key-pass',
    },
  });

  const setDir = getBackupSetDir(join(ctx.dataDir, 'backup'), 1);
  const receipt = Bun.file(join(setDir, backupSetLayout.receipt));

  const isWritten = await receipt.exists();

  expect(result.exitCode).toBe(0);
  expect(isWritten).toBeTrue();
  expect(result.stdout).toInclude('backup.set_published');
});

test('it exits 1 and logs the failed set when restic fails to prune for run', async () => {
  const ctx = await setupTest();

  await createStagedSet({
    stagingDir: join(ctx.dataDir, 'backup'),
    sequence: 1,
    kind: 'scheduled',
    isComplete: true,
  });

  const result = await run(ctx.program.command, {
    args: ['run'],
    cwd: ctx.program.cwd,
    env: {
      NIXIE_BACKUP_STAGING_DIR: join(ctx.dataDir, 'backup'),
      NIXIE_BACKUP_RESTIC: ctx.restic,
      NIXIE_BACKUP_DATA_REPOSITORY: join(ctx.dataDir, 'repos', 'data'),
      NIXIE_BACKUP_DATA_PASSWORD: 'data-pass',
      NIXIE_BACKUP_KEY_REPOSITORY: join(ctx.dataDir, 'repos', 'keys'),
      NIXIE_BACKUP_KEY_PASSWORD: 'key-pass',
      STUB_RESTIC_FAIL: 'prune',
    },
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('backup.set_failed');
});

test('it exits 0 and logs the held lock when another pass holds staging for run', async () => {
  const ctx = await setupTest();

  await createStagedSet({
    stagingDir: join(ctx.dataDir, 'backup'),
    sequence: 1,
    kind: 'scheduled',
    isComplete: true,
  });

  await writeFile(join(ctx.dataDir, 'backup', 'job.lock'), '');

  const lock = claimFileLock(join(ctx.dataDir, 'backup', 'job.lock'), 'exclusive');

  invariant(lock);

  ctx.cleanup.defer(() => {
    lock.release();
  });

  const result = await run(ctx.program.command, {
    args: ['run'],
    cwd: ctx.program.cwd,
    env: {
      NIXIE_BACKUP_STAGING_DIR: join(ctx.dataDir, 'backup'),
      NIXIE_BACKUP_RESTIC: ctx.restic,
      NIXIE_BACKUP_DATA_REPOSITORY: join(ctx.dataDir, 'repos', 'data'),
      NIXIE_BACKUP_DATA_PASSWORD: 'data-pass',
      NIXIE_BACKUP_KEY_REPOSITORY: join(ctx.dataDir, 'repos', 'keys'),
      NIXIE_BACKUP_KEY_PASSWORD: 'key-pass',
    },
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toInclude('backup.pass_locked');
});

test('it exits 1 and names the variable when the job has no key repo', async () => {
  const ctx = await setupTest();

  const result = await run(ctx.program.command, {
    args: ['run'],
    cwd: ctx.program.cwd,
    env: {
      NIXIE_BACKUP_STAGING_DIR: join(ctx.dataDir, 'backup'),
      NIXIE_BACKUP_RESTIC: ctx.restic,
      NIXIE_BACKUP_DATA_REPOSITORY: join(ctx.dataDir, 'repos', 'data'),
      NIXIE_BACKUP_DATA_PASSWORD: 'data-pass',
      NIXIE_BACKUP_KEY_REPOSITORY: undefined,
      NIXIE_BACKUP_KEY_PASSWORD: undefined,
    },
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('backup.job_failed');
  expect(result.stdout).toInclude('NIXIE_BACKUP_KEY_REPOSITORY');
});
