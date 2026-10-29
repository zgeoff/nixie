import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSnapshotSet } from '@heynixie/backup';
import { startDatabase } from '@heynixie/db';
import {
  createRecordKey,
  localDataStorage,
  removeRecordKey,
  withWriteTransaction,
} from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { $ } from 'bun';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildResticClient } from './build-restic-client';
import { runJobPass } from './run-job-pass';

// Bun's skipIf takes a boolean and has no in-body skip, so the gate reads the binary at collection;
// CI's image job always names one, so there a missing binary fails the run instead
const isResticMissing =
  process.env['NIXIE_RESTIC_BINARY'] === undefined && process.env['CI'] === undefined;

async function setupTest() {
  const restic = process.env['NIXIE_RESTIC_BINARY'] ?? 'restic';

  const log = await startTestLog();
  const repos = await mkdtemp(join(tmpdir(), 'nixie-restic-repos-'));

  onTestFinished(() => rm(repos, { recursive: true, force: true }));

  const config = {
    stagingDir: join(log.dataDir, 'backup'),
    restic,
    backendEnv: {},
    retention: { hourly: 24, daily: 7, weekly: 4, monthly: 6 },
  };

  const dataEnv = { RESTIC_REPOSITORY: join(repos, 'data'), RESTIC_PASSWORD: 'data-pass' };
  const keyEnv = { RESTIC_REPOSITORY: join(repos, 'keys'), RESTIC_PASSWORD: 'key-pass' };

  const clients = {
    data: buildResticClient(
      config,
      { repository: dataEnv.RESTIC_REPOSITORY, password: dataEnv.RESTIC_PASSWORD },
      'data',
    ),
    keys: buildResticClient(
      config,
      { repository: keyEnv.RESTIC_REPOSITORY, password: keyEnv.RESTIC_PASSWORD },
      'key',
    ),
  };

  return { ...log, restic, repos, config, dataEnv, keyEnv, clients };
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

    const payload = JSON.stringify({
      forgotten: Buffer.from(forgottenText).toString('base64'),
      neighbour: Buffer.from(neighbourText).toString('base64'),
    });

    await withWriteTransaction(ctx.writer, async (tx) => {
      await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
        values (1, 1798761600000, 'memory.version_added', 'snapshot-a', ${payload})`.execute(tx);
    });

    const wrapped =
      await sql`select wrapped from record_keys where key_id = ${forgotten.keyID}`.execute(
        ctx.writer.keys,
      );

    const [forgottenRow] = z
      .array(z.object({ wrapped: z.instanceof(Uint8Array) }))
      .parse(wrapped.rows);

    invariant(forgottenRow, 'the forgotten key has its wrapped row before the forget');

    await writeSnapshotSet(context, 'scheduled');
    await runJobPass(ctx.config, ctx.clients);
    await removeRecordKey(ctx.log, forgotten.keyID);

    await withWriteTransaction(ctx.writer, async (tx) => {
      await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
        values (2, 1798761660000, 'memory.forgotten', 'snapshot-a', '{}')`.execute(tx);
    });

    await writeSnapshotSet(context, 'forget');

    const receipts = await runJobPass(ctx.config, ctx.clients);
    const keySnapshots = await ctx.clients.keys.readSnapshotIDs();
    const dataSnapshots = await ctx.clients.data.readSnapshotIDs();

    await $`${ctx.restic} --no-cache restore ${keySnapshots[0] ?? ''} --target ${join(ctx.repos, 'keys-restored')}`
      .env(ctx.keyEnv)
      .quiet();

    const restoredKeys = startDatabase(join(ctx.repos, 'keys-restored', 'keys.db'), {
      readonly: true,
    });

    onTestFinished(() => restoredKeys.destroy());

    const keyRows = await sql`select key_id, wrapped from record_keys`.execute(restoredKeys);

    const restoredKeyRows = z
      .array(z.object({ key_id: z.string(), wrapped: z.instanceof(Uint8Array) }))
      .parse(keyRows.rows);

    const restoredPayloads = await Promise.all(
      dataSnapshots.map(async (snapshotID) => {
        const target = join(ctx.repos, `data-${snapshotID}`);

        await $`${ctx.restic} --no-cache restore ${snapshotID} --target ${target}`
          .env(ctx.dataEnv)
          .quiet();

        const restoredLog = startDatabase(join(target, 'nixie.db'), { readonly: true });

        onTestFinished(() => restoredLog.destroy());

        const rows = await sql`select payload from records where sequence = 1`.execute(restoredLog);

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

    const blobs = await Promise.all(
      blobList
        .trim()
        .split('\n')
        .map(async (line) => {
          const blob = await $`${ctx.restic} --no-cache cat blob ${line.split(' ').at(-1) ?? ''}`
            .env(ctx.keyEnv)
            .arrayBuffer();

          return Buffer.from(blob);
        }),
    );

    const [receipt] = receipts;

    invariant(receipt, 'the second pass publishes the forget set');

    expect(receipts).toMatchObject([
      { sequence: 2, status: 'published', prune: 'passed', check: 'passed' },
    ]);

    expect(keySnapshots).toStrictEqual([receipt.keySnapshotID ?? 'no key snapshot']);
    expect(restoredKeyRows.map((row) => row.key_id)).toStrictEqual([neighbour.keyID]);
    expect(restoredPayloads).toStrictEqual([payload, payload]);
    expect(new TextDecoder().decode(neighbourPlain)).toBe('Prefers window seats');
    expect(blobs).toSatisfyAll((blob: Buffer) => !blob.includes(Buffer.from(forgottenRow.wrapped)));
  },
);
