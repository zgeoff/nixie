import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { localDataStorage, withWriteTransaction } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { sql } from 'kysely';
import type { BackupPass } from './run-backup-pass';
import { startBackupSchedule } from './start-backup-schedule';

async function setupTest() {
  const log = await startTestLog();

  const onPass = mock<(pass: BackupPass) => void>();
  const onError = mock<(error: unknown) => void>();
  const onAbandoned = mock<(sequences: readonly number[]) => void>();

  return { ...log, onPass, onError, onAbandoned };
}

test('it stages a scheduled set at start when nixie holds none', async () => {
  const ctx = await setupTest();

  const schedule = startBackupSchedule({
    context: { writer: ctx.writer, storage: localDataStorage },
    intervalMs: 3_600_000,
    onAbandoned: ctx.onAbandoned,
    onPass: ctx.onPass,
    onError: ctx.onError,
  });

  onTestFinished(() => schedule.stop());

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);

  const sets = await sql`select sequence, kind, state from backup_sets`.execute(ctx.writer.db);

  expect(sets.rows).toStrictEqual([{ sequence: 1, kind: 'scheduled', state: 'staged' }]);
});

test('it stages a forget set as soon as a forgotten record commits, beside a set that waits', async () => {
  const ctx = await setupTest();

  const schedule = startBackupSchedule({
    context: { writer: ctx.writer, storage: localDataStorage },
    intervalMs: 3_600_000,
    onAbandoned: ctx.onAbandoned,
    onPass: ctx.onPass,
    onError: ctx.onError,
  });

  onTestFinished(() => schedule.stop());

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);

  await withWriteTransaction(ctx.writer, async (tx) => {
    await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
      values (1, 1798761600000, 'memory.forgotten', 'snapshot-a', '{}')`.execute(tx);
  });

  await waitForCondition(() =>
    ctx.onPass.mock.calls.some((call) => call[0].staged?.kind === 'forget'),
  );

  const sets = await sql`select sequence, kind, state from backup_sets`.execute(ctx.writer.db);

  expect(sets.rows).toStrictEqual([
    { sequence: 1, kind: 'scheduled', state: 'staged' },
    { sequence: 2, kind: 'forget', state: 'staged' },
  ]);
});

test('it records a receipt at the next poll, and stages the next set an interval after the last', async () => {
  const ctx = await setupTest();

  const schedule = startBackupSchedule({
    context: { writer: ctx.writer, storage: localDataStorage },
    intervalMs: 3_600_000,
    onAbandoned: ctx.onAbandoned,
    onPass: ctx.onPass,
    onError: ctx.onError,
  });

  onTestFinished(() => schedule.stop());

  await waitForCondition(
    () => ctx.onPass.mock.calls.length === 1 && ctx.clock.countSleepers() === 1,
  );

  await writeFile(
    join(ctx.dataDir, 'backup', '000000000001', 'receipt.json'),
    JSON.stringify({
      format: 1,
      sequence: 1,
      writtenAt: 1_798_761_660_000,
      status: 'published',
      dataSnapshotID: 'a'.repeat(64),
      keySnapshotID: 'b'.repeat(64),
      removedKeySnapshotIDs: [],
      prune: 'passed',
      check: 'passed',
      failure: null,
    }),
  );

  ctx.clock.advance(3_600_000);

  await waitForCondition(() => ctx.onPass.mock.calls.length === 2);

  expect(ctx.onPass.mock.calls[1]?.[0]).toMatchObject({
    received: [{ sequence: 1, status: 'published', failure: null }],
    staged: { sequence: 2, kind: 'scheduled' },
  });
});

test('it abandons the set an earlier start stopped copying before it stages a new one', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, async (tx) => {
    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (1, 'scheduled', 'staging', 0, 1798761600000)`.execute(tx);
  });

  await mkdir(join(ctx.dataDir, 'backup', '000000000001'), { recursive: true });

  const schedule = startBackupSchedule({
    context: { writer: ctx.writer, storage: localDataStorage },
    intervalMs: 3_600_000,
    onAbandoned: ctx.onAbandoned,
    onPass: ctx.onPass,
    onError: ctx.onError,
  });

  onTestFinished(() => schedule.stop());

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);

  expect(ctx.onAbandoned).toHaveBeenCalledExactlyOnceWith([1]);

  const sets = await sql`select sequence, kind, state from backup_sets`.execute(ctx.writer.db);

  expect(sets.rows).toStrictEqual([
    { sequence: 1, kind: 'scheduled', state: 'abandoned' },
    { sequence: 2, kind: 'scheduled', state: 'staged' },
  ]);
});

test('it passes a failed pass to onError, and tries again at the next poll', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'backup'), 'a file where staging belongs');

  const schedule = startBackupSchedule({
    context: { writer: ctx.writer, storage: localDataStorage },
    intervalMs: 3_600_000,
    onAbandoned: ctx.onAbandoned,
    onPass: ctx.onPass,
    onError: ctx.onError,
  });

  onTestFinished(() => schedule.stop());

  await waitForCondition(
    () => ctx.onError.mock.calls.length > 0 && ctx.clock.countSleepers() === 1,
  );

  const failures = ctx.onError.mock.calls.length;

  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.onError.mock.calls.length > failures);

  expect(ctx.onPass).not.toHaveBeenCalled();
});
