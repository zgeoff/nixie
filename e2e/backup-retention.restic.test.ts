import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStagedSet } from '@heynixie/backup-job/test-utils';
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

  const jobEnv = {
    NIXIE_BACKUP_STAGING_DIR: join(directory, 'backup'),
    NIXIE_BACKUP_RESTIC: restic,
    NIXIE_BACKUP_DATA_REPOSITORY: dataEnv.RESTIC_REPOSITORY,
    NIXIE_BACKUP_DATA_PASSWORD: dataEnv.RESTIC_PASSWORD,
    NIXIE_BACKUP_KEY_REPOSITORY: join(directory, 'keys'),
    NIXIE_BACKUP_KEY_PASSWORD: 'key-pass',
  };

  return { restic, job, directory, dataEnv, jobEnv };
}

test.skipIf(isResticMissing)(
  'it removes a data snapshot that the retention keeps no bucket for, and keeps the newest in each',
  async () => {
    const ctx = await setupTest();

    const older = join(ctx.directory, 'older.db');

    await writeFile(older, 'an older copy of nixie.db\n');

    await $`${ctx.restic} --no-cache init`.env(ctx.dataEnv).quiet();

    await $`${ctx.restic} --no-cache backup --host nixie --time ${'2020-01-01 10:00:00'} ${older}`
      .env(ctx.dataEnv)
      .quiet();

    await $`${ctx.restic} --no-cache backup --host nixie --time ${'2020-01-01 10:30:00'} ${older}`
      .env(ctx.dataEnv)
      .quiet();

    const seeded: unknown = await $`${ctx.restic} --no-cache snapshots --json`
      .env(ctx.dataEnv)
      .json();

    const [expired, kept] = z
      .array(z.object({ id: z.string(), time: z.string() }))
      .parse(seeded)
      .toSorted((first, second) => Date.parse(first.time) - Date.parse(second.time));

    invariant(expired && kept, 'restic lists both seeded snapshots');

    await createStagedSet({
      stagingDir: ctx.jobEnv.NIXIE_BACKUP_STAGING_DIR,
      sequence: 1,
      kind: 'scheduled',
      isComplete: true,
    });

    const run = await $`${process.execPath} ${ctx.job} run`.env(ctx.jobEnv).nothrow().quiet();

    const listed: unknown = await $`${ctx.restic} --no-cache snapshots --json`
      .env(ctx.dataEnv)
      .json();

    const snapshotIDs = z
      .array(z.object({ id: z.string() }))
      .parse(listed)
      .map((snapshot) => snapshot.id);

    expect(run.exitCode).toBe(0);
    expect(snapshotIDs).toHaveLength(2);
    expect(snapshotIDs).toContain(kept.id);
    expect(snapshotIDs).not.toContain(expired.id);
  },
);
