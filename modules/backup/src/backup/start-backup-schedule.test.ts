import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  localDataStorage,
  pauseNixieInTransaction,
  resumeNixieInTransaction,
  withWriteTransaction,
  writeRecordsInTransaction,
} from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { waitForCondition } from '@heynixie/testing';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { buildBackupSeeder, buildStubFailingStorage, writeTestBackupReceipt } from '../test-utils';
import type { BackupPass } from './run-backup-pass';
import { startBackupSchedule } from './start-backup-schedule';

async function setupTest() {
  const log = await startTestLog();

  const onPass = mock<(pass: BackupPass) => void>();
  const onError = mock<(error: unknown) => void>();
  const onAbandoned = mock<(sequences: readonly number[]) => void>();
  const definitions = { snapshotHash: 'sha256:aa11' };

  const writeForgottenRecord = (tx: Transaction<unknown>) =>
    writeRecordsInTransaction(tx, log.log, [
      { kind: 'memory.forgotten', definitions, payload: { itemID: 'item-a' } },
    ]);

  const writeRecord = (tx: Transaction<unknown>) =>
    writeRecordsInTransaction(tx, log.log, [{ kind: 'task.created', definitions, payload: {} }]);

  const context = { writer: log.writer, storage: localDataStorage };

  const startSchedule = () => {
    const schedule = startBackupSchedule({
      context,
      intervalMs: 3_600_000,
      onAbandoned,
      onPass,
      onError,
    });

    onTestFinished(() => schedule.stop());

    return schedule;
  };

  return {
    ...log,
    definitions,
    onPass,
    onError,
    onAbandoned,
    writeForgottenRecord,
    writeRecord,
    startSchedule,
    seed: buildBackupSeeder({ context }),
  };
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
  await withWriteTransaction(ctx.writer, (tx) => ctx.writeForgottenRecord(tx));

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

test('it passes the health of a pass whose staging fails to onPass, and the staging failure to onError', async () => {
  const ctx = await setupTest();

  const schedule = startBackupSchedule({
    context: {
      writer: ctx.writer,
      storage: buildStubFailingStorage(localDataStorage, 'complete', 'write'),
    },
    intervalMs: 3_600_000,
    onAbandoned: ctx.onAbandoned,
    onPass: ctx.onPass,
    onError: ctx.onError,
  });

  onTestFinished(() => schedule.stop());

  await waitForCondition(() => ctx.onError.mock.calls.length === 1);

  expect(ctx.onPass.mock.calls[0]?.[0]).toStrictEqual({
    received: [],
    noticed: [],
    staged: null,
    health: { lastUploadAt: null, newestSetAt: null, notice: null },
  });

  expect(ctx.onError.mock.calls[0]?.[0]).toSatisfy(
    (failure: unknown) =>
      failure instanceof Error && /^the stub fails the write of complete$/u.test(failure.message),
  );
});

test('it passes the receipts of a pass that fails after it records them to onPass, and both the failure and the failed health read to onError', async () => {
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

  await sql`drop table backup_notices`.execute(ctx.writer.db);

  await writeTestBackupReceipt(ctx.dataDir, { sequence: 1, status: 'published' });

  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.onError.mock.calls.length === 2);

  expect(ctx.onPass.mock.calls[1]?.[0]).toStrictEqual({
    received: [{ sequence: 1, status: 'published', failure: null }],
    noticed: [],
    staged: null,
    health: null,
  });

  expect(ctx.onError.mock.calls.map((call) => call[0])).toSatisfyAll(
    (failure: unknown) =>
      failure instanceof Error && /no such table: backup_notices/u.test(failure.message),
  );
});

test('it passes one failure to onError for a pass whose only failure is its health read', async () => {
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

  // SQLite computes a view's column only when a query reads it, and only the health read reads
  // raised_at, so the overflow fails that read and leaves the notice write working
  await sql`drop table backup_notices`.execute(ctx.writer.db);

  await sql`create view backup_notices as
    select 1 as sequence, 'failed' as cause, abs(-9223372036854775808) as raised_at`.execute(
    ctx.writer.db,
  );

  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.onPass.mock.calls.length === 2);

  expect(ctx.onError.mock.calls.map((call) => call[0])).toSatisfy(
    (failures: unknown[]) =>
      failures.length === 1 &&
      failures[0] instanceof Error &&
      /integer overflow/u.test(failures[0].message),
  );
});

test('it passes the failure of a pass to onError when onPass throws on that pass', async () => {
  const ctx = await setupTest();

  const onPass = mock<(pass: BackupPass) => void>(() => {
    throw new Error('the stub onPass fails');
  });

  const schedule = startBackupSchedule({
    context: {
      writer: ctx.writer,
      storage: buildStubFailingStorage(localDataStorage, 'complete', 'write'),
    },
    intervalMs: 3_600_000,
    onAbandoned: ctx.onAbandoned,
    onPass,
    onError: ctx.onError,
  });

  onTestFinished(() => schedule.stop());

  await waitForCondition(() => ctx.onError.mock.calls.length === 2);

  expect(ctx.onError.mock.calls.map((call) => call[0])).toSatisfy(
    (failures: unknown[]) =>
      failures.length === 2 &&
      failures[0] instanceof Error &&
      /^the stub onPass fails$/u.test(failures[0].message) &&
      failures[1] instanceof Error &&
      /^the stub fails the write of complete$/u.test(failures[1].message),
  );
});

test('it raises one notice for a failed receipt, however many passes follow it', async () => {
  const ctx = await setupTest();

  const startedAt = ctx.clock.now();

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

  await writeTestBackupReceipt(ctx.dataDir, {
    sequence: 1,
    status: 'failed',
    failure: 'data: backup exited 1',
  });

  ctx.clock.advance(60_000);

  await waitForCondition(
    () => ctx.onPass.mock.calls.length === 2 && ctx.clock.countSleepers() === 1,
  );

  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.onPass.mock.calls.length === 3);

  expect(ctx.onPass.mock.calls.flatMap((call) => call[0].noticed)).toStrictEqual([
    { sequence: 1, cause: 'failed', raisedAt: startedAt + 60_000 },
  ]);
});

test('it raises one notice for a set with no receipt an interval after it staged', async () => {
  const ctx = await setupTest();

  const startedAt = ctx.clock.now();

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

  ctx.clock.advance(3_600_000);

  await waitForCondition(
    () => ctx.onPass.mock.calls.length === 2 && ctx.clock.countSleepers() === 1,
  );

  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.onPass.mock.calls.length === 3);

  expect(ctx.onPass.mock.calls.flatMap((call) => call[0].noticed)).toStrictEqual([
    { sequence: 1, cause: 'missing', raisedAt: startedAt + 3_600_000 },
  ]);
});

test('it passes the time of the last upload once a published receipt is recorded', async () => {
  const ctx = await setupTest();

  const startedAt = ctx.clock.now();

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

  await writeTestBackupReceipt(ctx.dataDir, { sequence: 1, status: 'published' });

  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.onPass.mock.calls.length === 2);

  expect(ctx.onPass.mock.calls[1]?.[0].health).toStrictEqual({
    lastUploadAt: startedAt + 60_000,
    newestSetAt: startedAt,
    notice: null,
  });
});

test('it stages no set while a restore pause holds, and stages one after the resume', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, (tx) =>
    pauseNixieInTransaction(tx, ctx.log, {
      cause: 'restore',
      recoveryID: 'recovery-a',
      by: null,
      definitions: ctx.definitions,
    }),
  );

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

  ctx.clock.advance(3_600_000);

  await waitForCondition(() => ctx.onPass.mock.calls.length === 2);

  expect(ctx.onPass.mock.calls.map((call) => call[0].staged)).toStrictEqual([null, null]);

  const held = await sql`select sequence from backup_sets`.execute(ctx.writer.db);

  expect(held.rows).toStrictEqual([]);

  await withWriteTransaction(ctx.writer, (tx) =>
    resumeNixieInTransaction(tx, ctx.log, { by: 'session-a', definitions: ctx.definitions }),
  );

  await waitForCondition(() =>
    ctx.onPass.mock.calls.some((call) => call[0].staged?.kind === 'scheduled'),
  );

  const sets = await sql`select sequence, kind, state from backup_sets`.execute(ctx.writer.db);

  expect(sets.rows).toStrictEqual([{ sequence: 1, kind: 'scheduled', state: 'staged' }]);
});

test.each(['owner', 'spending'] as const)(
  'it stages a scheduled set at start while a %s pause holds',
  async (cause) => {
    const ctx = await setupTest();

    await withWriteTransaction(ctx.writer, (tx) =>
      pauseNixieInTransaction(tx, ctx.log, {
        cause,
        recoveryID: null,
        by: null,
        definitions: ctx.definitions,
      }),
    );

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
  },
);

test('it stages no forget set while a restore pause holds, and stages one after the resume', async () => {
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
    await pauseNixieInTransaction(tx, ctx.log, {
      cause: 'restore',
      recoveryID: 'recovery-a',
      by: null,
      definitions: ctx.definitions,
    });

    await ctx.writeForgottenRecord(tx);
  });

  await waitForCondition(() => ctx.onPass.mock.calls.length === 2);

  expect(ctx.onPass.mock.calls[1]?.[0].staged).toBeNull();

  await withWriteTransaction(ctx.writer, (tx) =>
    resumeNixieInTransaction(tx, ctx.log, { by: 'session-a', definitions: ctx.definitions }),
  );

  await waitForCondition(() =>
    ctx.onPass.mock.calls.some((call) => call[0].staged?.kind === 'forget'),
  );

  const sets = await sql`select kind, state from backup_sets`.execute(ctx.writer.db);

  expect(sets.rows).toStrictEqual([
    { kind: 'scheduled', state: 'staged' },
    { kind: 'forget', state: 'staged' },
  ]);
});

test('it stages no set at start when a forget is due under a restore pause', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, async (tx) => {
    await ctx.writeForgottenRecord(tx);

    await pauseNixieInTransaction(tx, ctx.log, {
      cause: 'restore',
      recoveryID: 'recovery-a',
      by: null,
      definitions: ctx.definitions,
    });
  });

  const schedule = startBackupSchedule({
    context: { writer: ctx.writer, storage: localDataStorage },
    intervalMs: 3_600_000,
    onAbandoned: ctx.onAbandoned,
    onPass: ctx.onPass,
    onError: ctx.onError,
  });

  onTestFinished(() => schedule.stop());

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);

  const sets = await sql`select sequence from backup_sets`.execute(ctx.writer.db);

  expect(ctx.onPass.mock.calls[0]?.[0].staged).toBeNull();
  expect(sets.rows).toStrictEqual([]);
});

test('it stages a scheduled set at once while no set waits, and reports the pass to onPass', async () => {
  const ctx = await setupTest();

  await ctx.seed.publishedBackupSet();

  const schedule = ctx.startSchedule();

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);

  const outcome = await schedule.stage();

  const sets = await sql`select sequence, kind, state from backup_sets order by sequence`.execute(
    ctx.writer.db,
  );

  expect(outcome).toMatchObject({ status: 'staged', manifest: { sequence: 2, kind: 'scheduled' } });

  expect(sets.rows).toStrictEqual([
    { sequence: 1, kind: 'scheduled', state: 'published' },
    { sequence: 2, kind: 'scheduled', state: 'staged' },
  ]);

  expect(ctx.onPass.mock.calls[1]?.[0]).toMatchObject({ staged: { sequence: 2 } });
});

test('it refuses with the sequence while a set is staged', async () => {
  const ctx = await setupTest();

  const schedule = ctx.startSchedule();

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);

  const outcome = await schedule.stage();

  const sets = await sql`select sequence, kind, state from backup_sets order by sequence`.execute(
    ctx.writer.db,
  );

  expect(outcome).toStrictEqual({ status: 'set_waiting', sequence: 1 });
  expect(sets.rows).toStrictEqual([{ sequence: 1, kind: 'scheduled', state: 'staged' }]);
});

test('it refuses with the sequence while a set is staging', async () => {
  const ctx = await setupTest();

  await ctx.seed.publishedBackupSet();

  const schedule = ctx.startSchedule();

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);

  await withWriteTransaction(ctx.writer, async (tx) => {
    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (5, 'scheduled', 'staging', 0, ${ctx.clock.now()})`.execute(tx);
  });

  const outcome = await schedule.stage();

  expect(outcome).toStrictEqual({ status: 'set_waiting', sequence: 5 });
});

test('it records a receipt the job wrote before it looks for a waiting set, then stages', async () => {
  const ctx = await setupTest();

  const schedule = ctx.startSchedule();

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);
  await writeTestBackupReceipt(ctx.dataDir, { sequence: 1, status: 'published' });

  const outcome = await schedule.stage();

  const sets = await sql`select sequence, kind, state from backup_sets order by sequence`.execute(
    ctx.writer.db,
  );

  expect(outcome).toMatchObject({ status: 'staged', manifest: { sequence: 2 } });

  expect(sets.rows).toStrictEqual([
    { sequence: 1, kind: 'scheduled', state: 'published' },
    { sequence: 2, kind: 'scheduled', state: 'staged' },
  ]);

  expect(ctx.onPass.mock.calls[1]?.[0]).toMatchObject({
    received: [{ sequence: 1, status: 'published', failure: null }],
  });
});

test('it refuses under a pause after a restore', async () => {
  const ctx = await setupTest();

  await ctx.seed.publishedBackupSet();

  await withWriteTransaction(ctx.writer, (tx) =>
    pauseNixieInTransaction(tx, ctx.log, {
      cause: 'restore',
      recoveryID: 'recovery-a',
      by: null,
      definitions: ctx.definitions,
    }),
  );

  const schedule = ctx.startSchedule();

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);

  const outcome = await schedule.stage();

  const sets = await sql`select sequence, kind, state from backup_sets order by sequence`.execute(
    ctx.writer.db,
  );

  expect(outcome).toStrictEqual({ status: 'restore_pause' });
  expect(sets.rows).toStrictEqual([{ sequence: 1, kind: 'scheduled', state: 'published' }]);
});

test('it stages under a pause by the owner', async () => {
  const ctx = await setupTest();

  await ctx.seed.publishedBackupSet();

  await withWriteTransaction(ctx.writer, (tx) =>
    pauseNixieInTransaction(tx, ctx.log, {
      cause: 'owner',
      recoveryID: null,
      by: null,
      definitions: ctx.definitions,
    }),
  );

  const schedule = ctx.startSchedule();

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);

  const outcome = await schedule.stage();

  expect(outcome).toMatchObject({ status: 'staged', manifest: { sequence: 2 } });
});

test('it runs a request sent during startup once the first pass ends, and stages exactly one set', async () => {
  const ctx = await setupTest();

  await ctx.seed.publishedBackupSet();

  const schedule = ctx.startSchedule();

  const outcome = await schedule.stage();

  const sets = await sql`select sequence, kind, state from backup_sets order by sequence`.execute(
    ctx.writer.db,
  );

  expect(outcome).toMatchObject({ status: 'staged', manifest: { sequence: 2 } });

  expect(sets.rows).toStrictEqual([
    { sequence: 1, kind: 'scheduled', state: 'published' },
    { sequence: 2, kind: 'scheduled', state: 'staged' },
  ]);
});

test('it refuses a request sent during startup when the first pass stages a set, and stages no second set', async () => {
  const ctx = await setupTest();

  const schedule = ctx.startSchedule();

  const outcome = await schedule.stage();

  const sets = await sql`select sequence, kind, state from backup_sets order by sequence`.execute(
    ctx.writer.db,
  );

  expect(outcome).toStrictEqual({ status: 'set_waiting', sequence: 1 });
  expect(sets.rows).toStrictEqual([{ sequence: 1, kind: 'scheduled', state: 'staged' }]);
});

test('it runs a request queued during a pass right after that pass, before a wake that arrived during the pass, and stages exactly one set', async () => {
  const ctx = await setupTest();

  await ctx.seed.publishedBackupSet();

  const held = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const gate = { isArmed: false };

  const holdingStorage = {
    ...localDataStorage,
    files: {
      ...localDataStorage.files,
      readDirectory: async (path: string) => {
        if (gate.isArmed) {
          gate.isArmed = false;

          entered.resolve();

          await held.promise;
        }

        return localDataStorage.files.readDirectory(path);
      },
    },
  };

  const schedule = startBackupSchedule({
    context: { writer: ctx.writer, storage: holdingStorage },
    intervalMs: 3_600_000,
    onAbandoned: ctx.onAbandoned,
    onPass: ctx.onPass,
    onError: ctx.onError,
  });

  onTestFinished(() => schedule.stop());

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);

  gate.isArmed = true;

  await withWriteTransaction(ctx.writer, (tx) => ctx.writeRecord(tx));
  await entered.promise;

  const staging = schedule.stage();

  await withWriteTransaction(ctx.writer, (tx) => ctx.writeRecord(tx));

  held.resolve();

  const outcome = await staging;

  await waitForCondition(() => ctx.onPass.mock.calls.length === 4);

  const sets = await sql`select sequence, kind, state from backup_sets order by sequence`.execute(
    ctx.writer.db,
  );

  expect(outcome).toMatchObject({ status: 'staged', manifest: { sequence: 2 } });
  expect(ctx.onPass.mock.calls[2]?.[0].staged).toMatchObject({ sequence: 2 });
  expect(ctx.onPass.mock.calls[3]?.[0].staged).toBeNull();

  expect(sets.rows).toStrictEqual([
    { sequence: 1, kind: 'scheduled', state: 'published' },
    { sequence: 2, kind: 'scheduled', state: 'staged' },
  ]);
});

test('it rejects a queued request when the schedule stops', async () => {
  const ctx = await setupTest();

  const schedule = ctx.startSchedule();
  const staging = schedule.stage();
  const stopped = schedule.stop();

  expect(staging).rejects.toThrow('the backup schedule stopped');

  await stopped;
});

test('it rejects a request sent after the schedule stopped', async () => {
  const ctx = await setupTest();

  const schedule = ctx.startSchedule();

  await schedule.stop();

  expect(schedule.stage()).rejects.toThrow('the backup schedule stopped');
});
