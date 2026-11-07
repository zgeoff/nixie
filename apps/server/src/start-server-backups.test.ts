import { expect, mock, onTestFinished, test } from 'bun:test';
import type { BackupConfig } from '@heynixie/backup';
import { writeTestBackupReceipt } from '@heynixie/backup/test-utils';
import { startTestLog } from '@heynixie/log/test-utils';
import type { Logger } from '@heynixie/logger';
import { waitForCondition } from '@heynixie/testing';
import { buildReadinessChecks } from './build-readiness-checks';
import { buildStartState } from './build-start-state';
import { startServerBackups } from './start-server-backups';

async function setupTest() {
  const log = await startTestLog();

  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const state = buildStartState({ isReady: true, reason: null });
  const logged = mock<Logger>();

  const checks = buildReadinessChecks(
    state,
    { read: () => ({ isReady: true, reason: null }) },
    log.clock,
  );

  return {
    ...log,
    state,
    logged,
    checks,
    startBackups: (backup: BackupConfig) =>
      startServerBackups({
        config: { backup },
        log: logged,
        state,
        cleanup: {
          defer: (stop) => {
            stack.defer(stop);

            return Promise.resolve();
          },
        },
        context: { log: { writer: log.writer } },
      }),
  };
}

test('it reports backups ready when the deployment turns them off', async () => {
  const ctx = await setupTest();

  await ctx.startBackups({ isEnabled: false, intervalMs: 3_600_000 });

  const report = await ctx.checks.dependencies.backups();

  expect(report).toStrictEqual({ isReady: true, reason: null });
});

test('it reports backups unready once no receipt arrives within twice the interval', async () => {
  const ctx = await setupTest();

  await ctx.startBackups({ isEnabled: true, intervalMs: 3_600_000 });

  await waitForCondition(
    () =>
      ctx.logged.mock.calls.some((call) => call[0] === 'backup.set_staged') &&
      ctx.clock.countSleepers() === 1,
  );

  ctx.clock.advance(7_200_000);

  const report = await ctx.checks.dependencies.backups();

  expect(report).toStrictEqual({
    isReady: false,
    reason: 'no backup set has published in the last 120 minutes',
    details: { newest_set_age_seconds: 7200, last_upload_at: null },
  });
});

test('it reports backups ready again once a published receipt arrives', async () => {
  const ctx = await setupTest();

  const startedAt = ctx.clock.now();

  await ctx.startBackups({ isEnabled: true, intervalMs: 3_600_000 });

  await waitForCondition(
    () =>
      ctx.logged.mock.calls.some((call) => call[0] === 'backup.set_staged') &&
      ctx.clock.countSleepers() === 1,
  );

  ctx.clock.advance(7_200_000);

  await waitForCondition(
    () =>
      ctx.logged.mock.calls.some((call) => call[0] === 'backup.notice_raised') &&
      ctx.clock.countSleepers() === 1,
  );

  await writeTestBackupReceipt(ctx.dataDir, { sequence: 1, status: 'published' });

  ctx.clock.advance(60_000);

  await waitForCondition(() =>
    ctx.logged.mock.calls.some((call) => call[0] === 'backup.set_published'),
  );

  const report = await ctx.checks.dependencies.backups();

  expect(report).toStrictEqual({
    isReady: true,
    reason: null,
    details: {
      newest_set_age_seconds: 0,
      last_upload_at: new Date(startedAt + 7_260_000).toISOString(),
    },
  });
});

test('it logs a notice for a set with no receipt an interval after it staged', async () => {
  const ctx = await setupTest();

  await ctx.startBackups({ isEnabled: true, intervalMs: 3_600_000 });

  await waitForCondition(
    () =>
      ctx.logged.mock.calls.some((call) => call[0] === 'backup.set_staged') &&
      ctx.clock.countSleepers() === 1,
  );

  ctx.clock.advance(3_600_000);

  await waitForCondition(() =>
    ctx.logged.mock.calls.some((call) => call[0] === 'backup.notice_raised'),
  );

  expect(ctx.logged.mock.calls.filter((call) => call[0] === 'backup.notice_raised')).toStrictEqual([
    ['backup.notice_raised', { sequence: 1, cause: 'missing' }, 'warn'],
  ]);
});
