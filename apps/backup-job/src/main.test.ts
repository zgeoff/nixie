import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStagedSet } from './test-utils/create-staged-set';
import { createStubRestic } from './test-utils/create-stub-restic';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-backup-main-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  const restic = await createStubRestic(dataDir);

  return { dataDir, restic, entry: join(import.meta.dir, 'main.ts') };
}

test('it publishes the staged sets once and exits 0 for run', async () => {
  const ctx = await setupTest();

  await createStagedSet({
    stagingDir: join(ctx.dataDir, 'backup'),
    sequence: 1,
    kind: 'scheduled',
    isComplete: true,
  });

  const child = Bun.spawn([process.execPath, ctx.entry, 'run'], {
    env: {
      NIXIE_BACKUP_STAGING_DIR: join(ctx.dataDir, 'backup'),
      NIXIE_BACKUP_RESTIC: ctx.restic,
      NIXIE_BACKUP_DATA_REPOSITORY: join(ctx.dataDir, 'repos', 'data'),
      NIXIE_BACKUP_DATA_PASSWORD: 'data-pass',
      NIXIE_BACKUP_KEY_REPOSITORY: join(ctx.dataDir, 'repos', 'keys'),
      NIXIE_BACKUP_KEY_PASSWORD: 'key-pass',
    },
    stdout: 'pipe',
    stderr: 'inherit',
  });

  const [output, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);

  const receipt = Bun.file(join(ctx.dataDir, 'backup', '000000000001', 'receipt.json'));

  const isWritten = await receipt.exists();

  expect(exitCode).toBe(0);
  expect(isWritten).toBeTrue();
  expect(output).toInclude('backup.set_published');
});

test('it exits 1 and names the variable when the job has no key repo', async () => {
  const ctx = await setupTest();

  const child = Bun.spawn([process.execPath, ctx.entry, 'run'], {
    env: {
      NIXIE_BACKUP_STAGING_DIR: join(ctx.dataDir, 'backup'),
      NIXIE_BACKUP_RESTIC: ctx.restic,
      NIXIE_BACKUP_DATA_REPOSITORY: join(ctx.dataDir, 'repos', 'data'),
      NIXIE_BACKUP_DATA_PASSWORD: 'data-pass',
    },
    stdout: 'pipe',
    stderr: 'inherit',
  });

  const [output, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);

  expect(exitCode).toBe(1);
  expect(output).toInclude('backup.job_failed');
  expect(output).toInclude('NIXIE_BACKUP_KEY_REPOSITORY');
});
