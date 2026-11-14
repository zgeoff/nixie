import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStagedSet, readBackupJobBundle } from '@heynixie/backup-job/test-utils';
import { $ } from 'bun';
import { z } from 'zod';

// Bun's skipIf takes a boolean and has no in-body skip, so the gate reads the binary at collection;
// CI's image job always names one, so there a missing binary fails the run instead
const isResticMissing =
  process.env['NIXIE_RESTIC_BINARY'] === undefined && process.env['CI'] === undefined;

async function setupTest() {
  const restic = process.env['NIXIE_RESTIC_BINARY'] ?? 'restic';

  const job = await readBackupJobBundle();
  const directory = await mkdtemp(join(tmpdir(), 'nixie-restic-fetch-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const dataEnv = { RESTIC_REPOSITORY: join(directory, 'data'), RESTIC_PASSWORD: 'data-pass' };
  const keyEnv = { RESTIC_REPOSITORY: join(directory, 'keys'), RESTIC_PASSWORD: 'key-pass' };

  const jobEnv = {
    NIXIE_BACKUP_STAGING_DIR: join(directory, 'backup'),
    NIXIE_BACKUP_RESTIC: restic,
    NIXIE_BACKUP_DATA_REPOSITORY: dataEnv.RESTIC_REPOSITORY,
    NIXIE_BACKUP_DATA_PASSWORD: dataEnv.RESTIC_PASSWORD,
    NIXIE_BACKUP_KEY_REPOSITORY: keyEnv.RESTIC_REPOSITORY,
    NIXIE_BACKUP_KEY_PASSWORD: keyEnv.RESTIC_PASSWORD,
  };

  const tagsSchema = z.array(z.string());
  const listedSchema = z.array(z.object({ time: z.string(), tags: tagsSchema }));

  const readSnapshots = async (env: Record<string, string>) => {
    const listed: unknown = await $`${restic} --no-cache snapshots --json`.env(env).json();

    return listedSchema.parse(listed);
  };

  return { restic, job, directory, dataEnv, keyEnv, jobEnv, readSnapshots };
}

test.skipIf(isResticMissing)('it stores and lists the 5 snapshot tags as written', async () => {
  const ctx = await setupTest();

  await $`${ctx.restic} --no-cache init`.env(ctx.keyEnv).quiet();

  await $`${ctx.restic} --no-cache backup --json --host nixie --stdin --tag set-18 --tag kind-full --tag publish-42 --tag legacy-set-17 --tag proven-from-7 < ${new Response('key rows')}`
    .env(ctx.keyEnv)
    .quiet();

  const listed = await ctx.readSnapshots(ctx.keyEnv);

  expect(listed.map((snapshot) => snapshot.tags)).toStrictEqual([
    ['set-18', 'kind-full', 'publish-42', 'legacy-set-17', 'proven-from-7'],
  ]);
});

test.skipIf(isResticMissing)(
  'it writes the key snapshot before the data snapshot, and numbers both',
  async () => {
    const ctx = await setupTest();

    await createStagedSet({
      stagingDir: ctx.jobEnv.NIXIE_BACKUP_STAGING_DIR,
      sequence: 1,
      kind: 'scheduled',
      isComplete: true,
    });

    const run = await $`${process.execPath} ${ctx.job} run`.env(ctx.jobEnv).nothrow().quiet();
    const keys = await ctx.readSnapshots(ctx.keyEnv);
    const data = await ctx.readSnapshots(ctx.dataEnv);

    expect(run.exitCode).toBe(0);

    expect(keys.map((snapshot) => snapshot.tags)).toStrictEqual([
      ['set-1', 'kind-scheduled', 'publish-1'],
    ]);

    expect(data.map((snapshot) => snapshot.tags)).toStrictEqual([
      ['set-1', 'kind-scheduled', 'publish-1'],
    ]);

    expect(Date.parse(keys[0]?.time ?? '')).toBeLessThan(Date.parse(data[0]?.time ?? ''));
  },
);
