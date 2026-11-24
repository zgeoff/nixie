import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStagedSet } from '@heynixie/backup-job/test-utils';
import {
  backupReceiptSchema,
  backupSetLayout,
  getBackupSetDir,
  parseBackupFile,
} from '@heynixie/wire';
import { resolveProgram } from '@zgeoff/rig/e2e';
import { run } from '@zgeoff/testing/process';
import { $ } from 'bun';
import invariant from 'tiny-invariant';
import { z } from 'zod';

// Bun's skipIf takes a boolean and has no in-body skip, so the gate reads the binary at collection;
// CI's image job always names one, so there a missing binary fails the run instead
const isResticMissing =
  process.env['NIXIE_RESTIC_BINARY'] === undefined && process.env['CI'] === undefined;

async function setupTest() {
  const restic = process.env['NIXIE_RESTIC_BINARY'] ?? 'restic';

  const job = await resolveProgram('backup-job');
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

    const published = await run(ctx.job.command, {
      args: ['run'],
      cwd: ctx.job.cwd,
      env: ctx.jobEnv,
    });

    const receiptText = await Bun.file(
      join(getBackupSetDir(ctx.jobEnv.NIXIE_BACKUP_STAGING_DIR, 1), backupSetLayout.receipt),
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

    expect(published.exitCode).toBe(0);
    expect(receipt.value.status).toBe('published');
    expect(snapshotIDs).toStrictEqual([receipt.value.dataSnapshotID ?? '']);
  },
);

test.skipIf(isResticMissing)(
  'it keeps the published data snapshot when a finished erasure withdraws a set while its data snapshot writes',
  async () => {
    const ctx = await setupTest();

    const stagingDir = ctx.jobEnv.NIXIE_BACKUP_STAGING_DIR;

    await createStagedSet({ stagingDir, sequence: 1, kind: 'scheduled', isComplete: true });
    await run(ctx.job.command, { args: ['run'], cwd: ctx.job.cwd, env: ctx.jobEnv });
    await createStagedSet({ stagingDir, sequence: 2, kind: 'forget', isComplete: true });

    const erasing = join(ctx.directory, 'erasing-restic');
    const floor = join(stagingDir, backupSetLayout.floor);

    await writeFile(
      erasing,
      [
        '#!/bin/sh',
        `if [ "$RESTIC_REPOSITORY" = '${ctx.dataEnv.RESTIC_REPOSITORY}' ]; then`,
        '  for arg in "$@"; do',
        `    [ "$arg" = backup ] && printf '{"format":1,"sequence":2}' > '${floor}'`,
        '  done',
        'fi',
        `exec '${ctx.restic}' "$@"`,
        '',
      ].join('\n'),
    );

    await chmod(erasing, 0o755);

    const withdrawn = await run(ctx.job.command, {
      args: ['run'],
      cwd: ctx.job.cwd,
      env: { ...ctx.jobEnv, NIXIE_BACKUP_RESTIC: erasing },
    });

    const hasReceipt = await Bun.file(
      join(getBackupSetDir(stagingDir, 2), backupSetLayout.receipt),
    ).exists();

    const listed: unknown = await $`${ctx.restic} --no-cache snapshots --json`
      .env(ctx.dataEnv)
      .json();

    const snapshotSchema = z.object({ tags: z.array(z.string()) });
    const snapshots = z.array(snapshotSchema).parse(listed);
    const tags = snapshots.map((snapshot) => snapshot.tags);

    expect(withdrawn.exitCode).toBe(0);
    expect(hasReceipt).toBeFalse();
    expect(tags).toStrictEqual([expect.arrayContaining(['set-1'])]);
  },
);
