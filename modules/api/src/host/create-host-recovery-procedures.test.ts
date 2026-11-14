import { expect, test } from 'bun:test';
import { installRestorePause } from '@heynixie/tasks';
import { createRouterClient } from '@orpc/server';
import { buildSeeder } from '../test-utils/build-seeder';
import { startTestAPI } from '../test-utils/start-test-api';
import { createHostRecoveryProcedures } from './create-host-recovery-procedures';

async function setupTest() {
  const api = await startTestAPI();

  return {
    ...api,
    seed: buildSeeder(api),
    client: createRouterClient(createHostRecoveryProcedures(api.context)),
    installRestore: () =>
      installRestorePause(api.context, {
        pending: { version: 1, recoveryID: 'recovery-a', restoredAt: 2000, backupTakenAt: 1000 },
        readTasksWithPendingActions: () => Promise.resolve([]),
      }),
  };
}

test('#read gives null before any restore', async () => {
  const ctx = await setupTest();
  const read = await ctx.client.read();

  expect(read).toStrictEqual({ recovery: null });
});

test('#read lists each task to check with its name', async () => {
  const ctx = await setupTest();

  await ctx.seed.conversationStep();
  await ctx.installRestore();

  const read = await ctx.client.read();

  expect(read).toStrictEqual({
    recovery: {
      restoredAt: new Date(2000),
      backupTakenAt: new Date(1000),
      toCheck: [
        {
          taskID: 'conversation',
          name: 'Conversation',
          stateAtBackup: 'running',
          wasRunning: true,
          pendingActions: 0,
        },
      ],
    },
  });
});
