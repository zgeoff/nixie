import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStagedSet } from '@heynixie/backup-job/test-utils';
import { backupReceiptSchema, parseBackupFile } from '@heynixie/wire';
import { $ } from 'bun';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { readBackupJobBundle } from './test-utils/read-backup-job-bundle';

// Bun's skipIf takes a boolean and has no in-body skip, so the gate reads the binary at collection;
// CI's image job always names one, so there a missing binary fails the run instead
const isResticMissing =
  process.env['NIXIE_RESTIC_BINARY'] === undefined && process.env['CI'] === undefined;

async function setupTest() {
  const restic = process.env['NIXIE_RESTIC_BINARY'] ?? 'restic';

  const job = await readBackupJobBundle();
  const directory = await mkdtemp(join(tmpdir(), 'nixie-restic-retention-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const dataEnv = { RESTIC_REPOSITORY: join(directory, 'data'), RESTIC_PASSWORD: 'data-pass' };

  // restic keeps the oldest snapshot too while a keep rule has fewer buckets than its count, so a
  // count of 1 for each rule is what lets an older snapshot expire in a repo this small
  const jobEnv = {
    NIXIE_BACKUP_STAGING_DIR: join(directory, 'backup'),
    NIXIE_BACKUP_RESTIC: restic,
    NIXIE_BACKUP_DATA_REPOSITORY: dataEnv.RESTIC_REPOSITORY,
    NIXIE_BACKUP_DATA_PASSWORD: dataEnv.RESTIC_PASSWORD,
    NIXIE_BACKUP_KEY_REPOSITORY: join(directory, 'keys'),
    NIXIE_BACKUP_KEY_PASSWORD: 'key-pass',
    NIXIE_BACKUP_KEEP_HOURLY: '1',
    NIXIE_BACKUP_KEEP_DAILY: '1',
    NIXIE_BACKUP_KEEP_WEEKLY: '1',
    NIXIE_BACKUP_KEEP_MONTHLY: '1',
  };

  return { restic, job, directory, dataEnv, jobEnv };
}

test.skipIf(isResticMissing)(
  'it removes every data snapshot that the retention keeps no bucket for',
  async () => {
    const ctx = await setupTest();

    const older = join(ctx.directory, 'older.db');

    await writeFile(older, 'an older copy of nixie.db\n');

    await $`${ctx.restic} --no-cache init`.env(ctx.dataEnv).quiet();

    await $`${ctx.restic} --no-cache backup --host nixie --time ${'2020-01-01 10:00:00'} ${older}`
      .env(ctx.dataEnv)
      .quiet();

    await $`${ctx.restic} --no-cache backup --host nixie --time ${'2020-02-01 10:00:00'} ${older}`
      .env(ctx.dataEnv)
      .quiet();

    await createStagedSet({
      stagingDir: ctx.jobEnv.NIXIE_BACKUP_STAGING_DIR,
      sequence: 1,
      kind: 'scheduled',
      isComplete: true,
    });

    const run = await $`${process.execPath} ${ctx.job} run`.env(ctx.jobEnv).nothrow().quiet();

    const receiptText = await Bun.file(
      join(ctx.jobEnv.NIXIE_BACKUP_STAGING_DIR, '000000000001', 'receipt.json'),
    ).text();

    const receipt = parseBackupFile(receiptText, backupReceiptSchema);

    const listed: unknown = await $`${ctx.restic} --no-cache snapshots --json`
      .env(ctx.dataEnv)
      .json();

    const snapshotIDs = z
      .array(z.object({ id: z.string() }))
      .parse(listed)
      .map((snapshot) => snapshot.id);

    invariant('value' in receipt, 'the job writes a receipt nixie can read');

    expect(run.exitCode).toBe(0);
    expect(receipt.value.status).toBe('published');
    expect(snapshotIDs).toStrictEqual([receipt.value.dataSnapshotID ?? '']);
  },
);
