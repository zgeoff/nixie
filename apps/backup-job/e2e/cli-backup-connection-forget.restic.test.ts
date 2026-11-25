import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getBackupStagingDir, writeSnapshotSet } from '@heynixie/backup';
import { startConnectionsHarness } from '@heynixie/connections/test-utils';
import { startDatabase } from '@heynixie/db';
import { getDataFilePath, localDataStorage } from '@heynixie/log';
import { readTestRecordKeyRows } from '@heynixie/log/test-utils';
import { resolveProgram } from '@zgeoff/rig/e2e';
import { run } from '@zgeoff/testing/process';
import { $ } from 'bun';
import { sql } from 'kysely';
import { z } from 'zod';

// Bun's skipIf takes a boolean and has no in-body skip, so the gate reads the binary at collection;
// CI's image job always names one, so there a missing binary fails the run instead
const isResticMissing =
  process.env['NIXIE_RESTIC_BINARY'] === undefined && process.env['CI'] === undefined;

async function setupTest() {
  const restic = process.env['NIXIE_RESTIC_BINARY'] ?? 'restic';

  const harness = await startConnectionsHarness();
  const job = await resolveProgram('backup-job');
  const repos = await mkdtemp(join(tmpdir(), 'nixie-restic-repos-'));

  onTestFinished(() => rm(repos, { recursive: true, force: true }));

  const dataEnv = { RESTIC_REPOSITORY: join(repos, 'data'), RESTIC_PASSWORD: 'data-pass' };
  const keyEnv = { RESTIC_REPOSITORY: join(repos, 'keys'), RESTIC_PASSWORD: 'key-pass' };

  const jobEnv = {
    NIXIE_BACKUP_STAGING_DIR: getBackupStagingDir(harness.dataDir),
    NIXIE_BACKUP_RESTIC: restic,
    NIXIE_BACKUP_DATA_REPOSITORY: dataEnv.RESTIC_REPOSITORY,
    NIXIE_BACKUP_DATA_PASSWORD: dataEnv.RESTIC_PASSWORD,
    NIXIE_BACKUP_KEY_REPOSITORY: keyEnv.RESTIC_REPOSITORY,
    NIXIE_BACKUP_KEY_PASSWORD: keyEnv.RESTIC_PASSWORD,
  };

  const snapshotContext = { writer: harness.log.writer, storage: localDataStorage };
  const runJob = () => run(job.command, { args: ['run'], cwd: job.cwd, env: jobEnv });

  const listSnapshotIDs = async (env: Readonly<Record<string, string>>) => {
    const list: unknown = await $`${restic} --no-cache snapshots --json`.env(env).json();

    return z
      .array(z.object({ id: z.string() }))
      .parse(list)
      .map((snapshot) => snapshot.id);
  };

  const restore = async (env: Readonly<Record<string, string>>, snapshotID: string) => {
    const target = join(repos, `restored-${snapshotID}`);

    await $`${restic} --no-cache restore ${snapshotID} --target ${target}`.env(env).quiet();

    return target;
  };

  return {
    ...harness,
    restic,
    dataEnv,
    keyEnv,
    snapshotContext,
    runJob,
    listSnapshotIDs,
    restore,
    writeSnapshotSet: (reason: 'scheduled' | 'forget') => writeSnapshotSet(snapshotContext, reason),
  };
}

test.skipIf(isResticMissing)(
  'it leaves no copy of a forgotten connection key in the key repo once it has pruned, while the older data snapshot still holds the sealed token',
  async () => {
    const ctx = await setupTest();
    const connection = await ctx.seedConnection();

    const id = connection.tokenRef.credentialID;

    const before = await ctx.readRow(id);
    const keyRowsBefore = await readTestRecordKeyRows(ctx.log.writer);

    const forgottenRows = keyRowsBefore.filter(
      (row) => row.key_id === before?.key_id || row.key_id === before?.token_key_id,
    );

    await ctx.writeSnapshotSet('scheduled');
    await ctx.runJob();
    await ctx.connections.forget.begin({ connection: id }, { by: 'user' });
    await ctx.connections.forget.finish(id);
    await ctx.writeSnapshotSet('forget');

    const job = await ctx.runJob();
    const keySnapshotIDs = await ctx.listSnapshotIDs(ctx.keyEnv);
    const dataSnapshotIDs = await ctx.listSnapshotIDs(ctx.dataEnv);

    const [keySnapshotID] = keySnapshotIDs;

    const keysTarget = await ctx.restore(ctx.keyEnv, keySnapshotID ?? '');

    const restoredKeys = startDatabase(getDataFilePath(keysTarget, 'keys.db'), { readonly: true });

    onTestFinished(() => restoredKeys.destroy());

    const keyRows = await sql`select key_id from record_keys`.execute(restoredKeys);

    const restoredKeyIDs = z
      .array(z.object({ key_id: z.string() }))
      .parse(keyRows.rows)
      .map((row) => row.key_id);

    const sealedTokens = await Promise.all(
      dataSnapshotIDs.map(async (snapshotID) => {
        const dataTarget = await ctx.restore(ctx.dataEnv, snapshotID);

        const restoredLog = startDatabase(getDataFilePath(dataTarget, 'nixie.db'), {
          readonly: true,
        });

        onTestFinished(() => restoredLog.destroy());

        const rows =
          await sql`select refresh_token_sealed from connections where connection_id = ${id}`.execute(
            restoredLog,
          );

        return z
          .array(z.object({ refresh_token_sealed: z.instanceof(Uint8Array).nullable() }))
          .parse(rows.rows)
          .map((row) => row.refresh_token_sealed !== null);
      }),
    );

    const blobList = await $`${ctx.restic} --no-cache list blobs`.env(ctx.keyEnv).text();

    // a file's bytes live only in data blobs, and each restic command pays a full key derivation, so
    // the check reads the data blobs alone
    const blobs = await Promise.all(
      blobList
        .trim()
        .split('\n')
        .filter((line) => line.startsWith('data '))
        .map(async (line) => {
          const blob = await $`${ctx.restic} --no-cache cat blob ${line.split(' ').at(-1) ?? ''}`
            .env(ctx.keyEnv)
            .arrayBuffer();

          return Buffer.from(blob);
        }),
    );

    expect(job.exitCode).toBe(0);
    expect(forgottenRows).toHaveLength(2);
    expect(keySnapshotIDs).toHaveLength(1);
    expect(dataSnapshotIDs).toHaveLength(2);
    expect(sealedTokens).toStrictEqual([[true], [false]]);

    expect(
      restoredKeyIDs.some((keyID) => forgottenRows.some((row) => row.key_id === keyID)),
    ).toBeFalse();

    expect(blobs.length).toBeGreaterThan(0);

    expect(blobs).toSatisfyAll((blob: Buffer) =>
      forgottenRows.every((row) => !blob.includes(Buffer.from(row.wrapped))),
    );
  },
);
