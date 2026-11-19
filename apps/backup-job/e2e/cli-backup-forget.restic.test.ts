import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getBackupStagingDir, writeSnapshotSet } from '@heynixie/backup';
import { startDatabase } from '@heynixie/db';
import { createRecordKey, getDataFilePath, localDataStorage, removeRecordKey } from '@heynixie/log';
import { buildLogSeeder, readTestRecordKeyRows, startTestLog } from '@heynixie/log/test-utils';
import type { MemoryRecordKind } from '@heynixie/memory';
import {
  backupReceiptSchema,
  backupSetLayout,
  getBackupSetDir,
  parseBackupFile,
} from '@heynixie/wire';
import { resolveProgram } from '@zgeoff/rig/e2e';
import { run } from '@zgeoff/testing/process';
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

  const log = await startTestLog();
  const job = await resolveProgram('backup-job');
  const repos = await mkdtemp(join(tmpdir(), 'nixie-restic-repos-'));

  onTestFinished(() => rm(repos, { recursive: true, force: true }));

  const dataEnv = { RESTIC_REPOSITORY: join(repos, 'data'), RESTIC_PASSWORD: 'data-pass' };
  const keyEnv = { RESTIC_REPOSITORY: join(repos, 'keys'), RESTIC_PASSWORD: 'key-pass' };

  const jobEnv = {
    NIXIE_BACKUP_STAGING_DIR: getBackupStagingDir(log.dataDir),
    NIXIE_BACKUP_RESTIC: restic,
    NIXIE_BACKUP_DATA_REPOSITORY: dataEnv.RESTIC_REPOSITORY,
    NIXIE_BACKUP_DATA_PASSWORD: dataEnv.RESTIC_PASSWORD,
    NIXIE_BACKUP_KEY_REPOSITORY: keyEnv.RESTIC_REPOSITORY,
    NIXIE_BACKUP_KEY_PASSWORD: keyEnv.RESTIC_PASSWORD,
  };

  return { ...log, restic, job, repos, dataEnv, keyEnv, jobEnv, seed: buildLogSeeder(log) };
}

test.skipIf(isResticMissing)(
  'it leaves no copy of a forgotten key in the key repo once it has pruned, while every older data snapshot and the neighbour key still restore',
  async () => {
    const ctx = await setupTest();

    const context = { writer: ctx.writer, storage: localDataStorage };

    const iv = new Uint8Array(12);

    const forgotten = await createRecordKey(ctx.log);
    const neighbour = await createRecordKey(ctx.log);

    const forgottenText = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      forgotten.key,
      new TextEncoder().encode('Allergic to penicillin'),
    );

    const neighbourText = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      neighbour.key,
      new TextEncoder().encode('Prefers window seats'),
    );

    const added = await ctx.seed.record({
      kind: 'memory.version_added' satisfies MemoryRecordKind,
      payload: {
        forgotten: Buffer.from(forgottenText).toString('base64'),
        neighbour: Buffer.from(neighbourText).toString('base64'),
      },
    });

    const liveKeyRows = await readTestRecordKeyRows(ctx.writer);

    const forgottenRow = liveKeyRows.find((row) => row.key_id === forgotten.keyID);

    invariant(forgottenRow, 'the forgotten key has its wrapped row before the forget');

    await writeSnapshotSet(context, 'scheduled');
    await run(ctx.job.command, { args: ['run'], cwd: ctx.job.cwd, env: ctx.jobEnv });
    await removeRecordKey(ctx.log, forgotten.keyID);

    await ctx.seed.record({ kind: 'memory.forgotten' satisfies MemoryRecordKind, payload: {} });

    await writeSnapshotSet(context, 'forget');

    const job = await run(ctx.job.command, { args: ['run'], cwd: ctx.job.cwd, env: ctx.jobEnv });

    const receiptText = await Bun.file(
      join(getBackupSetDir(ctx.jobEnv.NIXIE_BACKUP_STAGING_DIR, 2), backupSetLayout.receipt),
    ).text();

    const receipt = parseBackupFile(receiptText, backupReceiptSchema);

    const keyList: unknown = await $`${ctx.restic} --no-cache snapshots --json`
      .env(ctx.keyEnv)
      .json();

    const dataList: unknown = await $`${ctx.restic} --no-cache snapshots --json`
      .env(ctx.dataEnv)
      .json();

    const keySnapshots = z.array(z.object({ id: z.string() })).parse(keyList);
    const dataSnapshots = z.array(z.object({ id: z.string() })).parse(dataList);

    await $`${ctx.restic} --no-cache restore ${keySnapshots[0]?.id ?? ''} --target ${join(ctx.repos, 'keys-restored')}`
      .env(ctx.keyEnv)
      .quiet();

    const restoredKeys = startDatabase(
      getDataFilePath(join(ctx.repos, 'keys-restored'), 'keys.db'),
      {
        readonly: true,
      },
    );

    onTestFinished(() => restoredKeys.destroy());

    const keyRows = await sql`select key_id, wrapped from record_keys`.execute(restoredKeys);

    const restoredKeyRows = z
      .array(z.object({ key_id: z.string(), wrapped: z.instanceof(Uint8Array) }))
      .parse(keyRows.rows);

    const restoredPayloads = await Promise.all(
      dataSnapshots.map(async (snapshot) => {
        const target = join(ctx.repos, `data-${snapshot.id}`);

        await $`${ctx.restic} --no-cache restore ${snapshot.id} --target ${target}`
          .env(ctx.dataEnv)
          .quiet();

        const restoredLog = startDatabase(getDataFilePath(target, 'nixie.db'), { readonly: true });

        onTestFinished(() => restoredLog.destroy());

        const rows =
          await sql`select payload from records where sequence = ${added.sequence}`.execute(
            restoredLog,
          );

        return z.array(z.object({ payload: z.string() })).parse(rows.rows)[0]?.payload;
      }),
    );

    const [neighbourRow] = restoredKeyRows;

    invariant(neighbourRow, 'the key snapshot holds the neighbour key');

    const neighbourKey = await crypto.subtle.unwrapKey(
      'raw',
      neighbourRow.wrapped,
      ctx.log.deploymentKey,
      'AES-KW',
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );

    const first = z
      .object({ neighbour: z.string() })
      .parse(JSON.parse(restoredPayloads[0] ?? '{}'));

    const neighbourPlain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      neighbourKey,
      Buffer.from(first.neighbour, 'base64'),
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

    invariant('value' in receipt, 'the second job run writes the forget set its receipt');

    expect(job.exitCode).toBe(0);

    expect(receipt.value).toMatchObject({
      sequence: 2,
      status: 'published',
      prune: 'passed',
      check: 'passed',
    });

    expect(keySnapshots.map((snapshot) => snapshot.id)).toStrictEqual([
      receipt.value.keySnapshotID ?? 'no key snapshot',
    ]);

    expect(restoredKeyRows.map((row) => row.key_id)).toStrictEqual([neighbour.keyID]);

    expect(restoredPayloads).toStrictEqual([
      JSON.stringify(added.payload),
      JSON.stringify(added.payload),
    ]);

    expect(new TextDecoder().decode(neighbourPlain)).toBe('Prefers window seats');
    expect(blobs.length).toBeGreaterThan(0);
    expect(blobs).toSatisfyAll((blob: Buffer) => !blob.includes(Buffer.from(forgottenRow.wrapped)));
  },
);
