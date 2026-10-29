import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { writeSnapshotSet } from '@heynixie/backup';
import { localDataStorage } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { createStubRestic } from './test-utils/create-stub-restic';

async function setupTest() {
  const log = await startTestLog();
  const restic = await createStubRestic(log.dataDir);

  return { ...log, restic, entry: join(import.meta.dir, 'main.ts') };
}

test('it publishes the staged sets once and exits 0 for run', async () => {
  const ctx = await setupTest();

  await writeSnapshotSet({ writer: ctx.writer, storage: localDataStorage }, 'scheduled');

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
