import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getBackupStagingDir, writeSnapshotSet } from '@heynixie/backup';
import { createStagedSet, readBackupJobBundle } from '@heynixie/backup-job/test-utils';
import { startDatabase } from '@heynixie/db';
import { getDataFilePath, localDataStorage } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import {
  fetchedPairFile,
  fetchedPairSchema,
  parseBackupFile,
  unfinishedBackupMarker,
} from '@heynixie/wire';
import { $ } from 'bun';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
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

test.skipIf(isResticMissing)(
  'it gives 2 intact database files for a publish and a fetch through real repositories',
  async () => {
    const ctx = await setupTest();
    const log = await startTestLog();

    await writeSnapshotSet({ writer: log.writer, storage: localDataStorage }, 'scheduled');

    const jobEnv = {
      ...ctx.jobEnv,
      NIXIE_BACKUP_STAGING_DIR: getBackupStagingDir(log.dataDir),
    };

    const target = join(ctx.directory, 'fetched');

    const run = await $`${process.execPath} ${ctx.job} run`.env(jobEnv).nothrow().quiet();

    const fetch = await $`${process.execPath} ${ctx.job} fetch --to ${target}`
      .env(jobEnv)
      .nothrow()
      .quiet();

    const pairText = await Bun.file(join(target, fetchedPairFile)).text();

    const parsed = parseBackupFile(pairText, fetchedPairSchema);

    const hasMarker = await Bun.file(join(target, unfinishedBackupMarker)).exists();

    invariant('value' in parsed, 'the fetch writes a pair file that parses');

    const checks = await Promise.all(
      (['nixie.db', 'keys.db'] as const).map(async (name) => {
        const database = startDatabase(getDataFilePath(target, name), { readonly: true });

        onTestFinished(() => database.destroy());

        const result = await sql`pragma integrity_check`.execute(database);

        return z.array(z.object({ integrity_check: z.string() })).parse(result.rows);
      }),
    );

    expect(run.exitCode).toBe(0);
    expect(fetch.exitCode).toBe(0);
    expect(parsed.value.relation).toBe('same-publish');
    expect(hasMarker).toBeFalse();
    expect(checks).toStrictEqual([[{ integrity_check: 'ok' }], [{ integrity_check: 'ok' }]]);
  },
);
