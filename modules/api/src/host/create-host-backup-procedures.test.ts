import { expect, onTestFinished, test } from 'bun:test';
import { startBackupSchedule } from '@heynixie/backup';
import { localDataStorage } from '@heynixie/log';
import { installRestorePause } from '@heynixie/tasks';
import { waitForCondition } from '@heynixie/testing';
import { createRouterClient } from '@orpc/server';
import { seedPublishedBackupSet } from '../test-utils/seed-published-backup-set';
import { startTestAPI } from '../test-utils/start-test-api';
import type { HostBackups } from '../types';
import { createHostBackupProcedures } from './create-host-backup-procedures';

async function setupTest() {
  const api = await startTestAPI();

  const holder: { backups: HostBackups | null } = { backups: null };
  const onPass = { count: 0 };

  return {
    ...api,
    client: createRouterClient(createHostBackupProcedures(() => holder.backups)),
    setOff: () => {
      holder.backups = { state: 'off' };
    },
    startSchedule: async () => {
      const schedule = startBackupSchedule({
        context: { writer: api.writer, storage: localDataStorage },
        intervalMs: Number.MAX_SAFE_INTEGER,
        onAbandoned: () => {},
        onPass: () => {
          onPass.count += 1;
        },
        onError: () => {},
      });

      onTestFinished(() => schedule.stop());

      holder.backups = { state: 'on', schedule };

      await waitForCondition(() => onPass.count === 1);
    },
    installRestore: () =>
      installRestorePause(api.context, {
        pending: { version: 1, recoveryID: 'recovery-a', restoredAt: 2000, backupTakenAt: 1000 },
        readTasksWithPendingActions: () => Promise.resolve([]),
      }),
  };
}

test('#stage answers the sequence, kind and time of the set it staged', async () => {
  const ctx = await setupTest();

  await seedPublishedBackupSet(ctx.writer, { sequence: 1, logHead: 0 });

  await ctx.startSchedule();

  const staged = await ctx.client.stage();

  expect(staged).toStrictEqual({ sequence: 2, kind: 'scheduled', stagedAt: expect.any(Date) });
});

test('#stage refuses with the sequence of the set that waits for the backup job', async () => {
  const ctx = await setupTest();

  await ctx.startSchedule();

  const stage = ctx.client.stage();

  await Promise.allSettled([stage]);

  expect(stage).rejects.toMatchObject({
    code: 'BACKUP_SET_WAITING',
    status: 409,
    message:
      'backup set 1 is staged and the backup job has not shipped it yet, so nixie stages no other set; run the backup job, then try again',
  });
});

test('#stage refuses when backups are off', async () => {
  const ctx = await setupTest();

  ctx.setOff();

  const stage = ctx.client.stage();

  await Promise.allSettled([stage]);

  expect(stage).rejects.toMatchObject({
    code: 'BACKUPS_OFF',
    status: 409,
    message: "backups are off in nixie's configuration, so nixie stages no set",
  });
});

test('#stage refuses before the backups part has started', async () => {
  const ctx = await setupTest();

  const stage = ctx.client.stage();

  await Promise.allSettled([stage]);

  expect(stage).rejects.toMatchObject({
    code: 'BACKUPS_NOT_STARTED',
    status: 503,
    message: 'nixie has not started its backups yet; try again in a moment',
  });
});

test('#stage refuses while nixie is paused after a restore', async () => {
  const ctx = await setupTest();

  await seedPublishedBackupSet(ctx.writer, { sequence: 1, logHead: 0 });

  await ctx.installRestore();
  await ctx.startSchedule();

  const stage = ctx.client.stage();

  await Promise.allSettled([stage]);

  expect(stage).rejects.toMatchObject({
    code: 'RESTORE_PAUSED',
    status: 409,
    message:
      'nixie is paused after a restore and stages no backup set until you read `nixie recovery` and run `nixie resume`',
  });
});
