import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimFileLock } from '@heynixie/async';
import { createStagedSet, createStubRestic } from '@heynixie/backup-job/test-utils';
import { stopProcesses } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { readBackupJobBundle } from './test-utils/read-backup-job-bundle';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-backup-cli-'));

  // Bun runs onTestFinished callbacks in the order they register, so a stack, which unwinds in
  // reverse, stops each job's process group and waits for it before the data folder goes
  const cleanup = new AsyncDisposableStack();

  onTestFinished(() => cleanup.disposeAsync());

  cleanup.defer(() => rm(dataDir, { recursive: true, force: true }));

  const restic = await createStubRestic(dataDir);
  const bundle = await readBackupJobBundle();

  return { dataDir, restic, bundle, cleanup };
}

test('it publishes the staged sets once and exits 0 for run', async () => {
  const ctx = await setupTest();

  await createStagedSet({
    stagingDir: join(ctx.dataDir, 'backup'),
    sequence: 1,
    kind: 'scheduled',
    isComplete: true,
  });

  const child = Bun.spawn([process.execPath, ctx.bundle, 'run'], {
    env: {
      NIXIE_BACKUP_STAGING_DIR: join(ctx.dataDir, 'backup'),
      NIXIE_BACKUP_RESTIC: ctx.restic,
      NIXIE_BACKUP_DATA_REPOSITORY: join(ctx.dataDir, 'repos', 'data'),
      NIXIE_BACKUP_DATA_PASSWORD: 'data-pass',
      NIXIE_BACKUP_KEY_REPOSITORY: join(ctx.dataDir, 'repos', 'keys'),
      NIXIE_BACKUP_KEY_PASSWORD: 'key-pass',
    },
    detached: true,
    stdout: 'pipe',
    stderr: 'inherit',
  });

  ctx.cleanup.defer(async () => {
    stopProcesses([child.pid]);

    await child.exited;
  });

  const [output, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);

  const receipt = Bun.file(join(ctx.dataDir, 'backup', '000000000001', 'receipt.json'));

  const isWritten = await receipt.exists();

  expect(exitCode).toBe(0);
  expect(isWritten).toBeTrue();
  expect(output).toInclude('backup.set_published');
});

test('it exits 1 and logs the failed set when restic fails to prune for run', async () => {
  const ctx = await setupTest();

  await createStagedSet({
    stagingDir: join(ctx.dataDir, 'backup'),
    sequence: 1,
    kind: 'scheduled',
    isComplete: true,
  });

  const child = Bun.spawn([process.execPath, ctx.bundle, 'run'], {
    env: {
      NIXIE_BACKUP_STAGING_DIR: join(ctx.dataDir, 'backup'),
      NIXIE_BACKUP_RESTIC: ctx.restic,
      NIXIE_BACKUP_DATA_REPOSITORY: join(ctx.dataDir, 'repos', 'data'),
      NIXIE_BACKUP_DATA_PASSWORD: 'data-pass',
      NIXIE_BACKUP_KEY_REPOSITORY: join(ctx.dataDir, 'repos', 'keys'),
      NIXIE_BACKUP_KEY_PASSWORD: 'key-pass',
      STUB_RESTIC_FAIL: 'prune',
    },
    detached: true,
    stdout: 'pipe',
    stderr: 'inherit',
  });

  ctx.cleanup.defer(async () => {
    stopProcesses([child.pid]);

    await child.exited;
  });

  const [output, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);

  expect(exitCode).toBe(1);
  expect(output).toInclude('backup.set_failed');
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

  const child = Bun.spawn([process.execPath, ctx.bundle, 'run'], {
    env: {
      NIXIE_BACKUP_STAGING_DIR: join(ctx.dataDir, 'backup'),
      NIXIE_BACKUP_RESTIC: ctx.restic,
      NIXIE_BACKUP_DATA_REPOSITORY: join(ctx.dataDir, 'repos', 'data'),
      NIXIE_BACKUP_DATA_PASSWORD: 'data-pass',
      NIXIE_BACKUP_KEY_REPOSITORY: join(ctx.dataDir, 'repos', 'keys'),
      NIXIE_BACKUP_KEY_PASSWORD: 'key-pass',
    },
    detached: true,
    stdout: 'pipe',
    stderr: 'inherit',
  });

  ctx.cleanup.defer(async () => {
    stopProcesses([child.pid]);

    await child.exited;
  });

  const [output, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);

  expect(exitCode).toBe(0);
  expect(output).toInclude('backup.pass_locked');
});

test('it exits 1 and names the variable when the job has no key repo', async () => {
  const ctx = await setupTest();

  const child = Bun.spawn([process.execPath, ctx.bundle, 'run'], {
    env: {
      NIXIE_BACKUP_STAGING_DIR: join(ctx.dataDir, 'backup'),
      NIXIE_BACKUP_RESTIC: ctx.restic,
      NIXIE_BACKUP_DATA_REPOSITORY: join(ctx.dataDir, 'repos', 'data'),
      NIXIE_BACKUP_DATA_PASSWORD: 'data-pass',
    },
    detached: true,
    stdout: 'pipe',
    stderr: 'inherit',
  });

  ctx.cleanup.defer(async () => {
    stopProcesses([child.pid]);

    await child.exited;
  });

  const [output, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);

  expect(exitCode).toBe(1);
  expect(output).toInclude('backup.job_failed');
  expect(output).toInclude('NIXIE_BACKUP_KEY_REPOSITORY');
});
