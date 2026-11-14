import { expect, test } from 'bun:test';
import { installRestorePause } from '@heynixie/tasks';
import { buildSeeder } from '../test-utils/build-seeder';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';

async function setupTest() {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  return {
    ...api,
    seed: buildSeeder(api),
    client: buildTestClient(api.url, laptop.token),
    installRestore: () =>
      installRestorePause(api.context, {
        pending: { version: 1, recoveryID: 'recovery-a', restoredAt: 2000, backupTakenAt: 1000 },
        readTasksWithPendingActions: () => Promise.resolve([]),
      }),
  };
}

test('#recovery.read gives null before any restore', async () => {
  const ctx = await setupTest();
  const read = await ctx.client.recovery.read({});

  expect(read).toStrictEqual({ recovery: null });
});

test('#recovery.read refuses a caller with no session', async () => {
  const ctx = await setupTest();

  const read = buildTestClient(ctx.url).recovery.read({});

  await Promise.allSettled([read]);

  expect(read).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#recovery.read lists each task to check with its name', async () => {
  const ctx = await setupTest();

  await ctx.seed.conversationStep();
  await ctx.installRestore();

  const read = await ctx.client.recovery.read({});

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

test('#recovery.read still gives the list after the resume', async () => {
  const ctx = await setupTest();

  await ctx.seed.conversationStep();
  await ctx.installRestore();
  await ctx.client.nixie.resume({ clientActionID: '7c1e3a5b-9d2f-4b6a-8e0c-2f4a6b8d1c3e' });

  const read = await ctx.client.recovery.read({});

  expect(read.recovery?.toCheck).toHaveLength(1);
});
