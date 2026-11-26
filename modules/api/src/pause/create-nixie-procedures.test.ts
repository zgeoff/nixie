import { expect, test } from 'bun:test';
import type { FeatureID } from '@heynixie/contract';
import {
  pauseNixieInTransaction,
  readRecords,
  withWriteTransaction,
  writeRecords,
} from '@heynixie/log';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';

async function setupTest(features: readonly FeatureID[] = []) {
  const api = await startTestAPI(undefined, { features });
  const laptop = await createDeviceSession(api.context, 'laptop');

  return {
    ...api,
    laptop,
    client: buildTestClient(api.url, laptop.token),
    writeStartedTask: (taskID: string) =>
      writeRecords(api.context.log, [
        {
          kind: 'task.created',
          definitions: { snapshotHash: 'sha256:test' },
          thread: taskID,
          payload: { taskID, isConversation: false, state: 'ready', startedBy: 'conversation' },
          erasable: { name: 'Garden plan', brief: 'Plan the beds.' },
        },
      ]),
    readNixieRecords: () =>
      readRecords(api.context.log, {
        afterSequence: 0,
        kinds: ['nixie.paused', 'nixie.resumed'],
      }),
  };
}

test('#nixie.read gives null while nixie runs', async () => {
  const ctx = await setupTest();
  const read = await ctx.client.nixie.read({});

  expect(read).toStrictEqual({ paused: null, features: [] });
});

test('#nixie.read reports the features that are on', async () => {
  const ctx = await setupTest(['voice', 'spend']);
  const read = await ctx.client.nixie.read({});

  expect(read).toStrictEqual({ paused: null, features: ['voice', 'spend'] });
});

test('#nixie.read refuses a caller with no session', async () => {
  const ctx = await setupTest();

  const read = buildTestClient(ctx.url).nixie.read({});

  await Promise.allSettled([read]);

  expect(read).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#nixie.pause pauses nixie for the owner, and writes the session as the actor', async () => {
  const ctx = await setupTest();

  const paused = await ctx.client.nixie.pause({
    clientActionID: '4b2d6f8a-1c3e-4a5b-9d7f-0e2c4a6b8d1f',
  });

  const records = await ctx.readNixieRecords();

  expect(paused).toStrictEqual({ paused: { cause: 'owner', since: expect.toBeValidDate() } });

  expect(records.map((read) => [read.record.kind, read.record.payload])).toStrictEqual([
    ['nixie.paused', { cause: 'owner', recoveryID: null, by: ctx.laptop.caller.identityID }],
  ]);
});

test('#nixie.read gives the pause that #nixie.pause wrote', async () => {
  const ctx = await setupTest();

  const paused = await ctx.client.nixie.pause({
    clientActionID: '4b2d6f8a-1c3e-4a5b-9d7f-0e2c4a6b8d1f',
  });

  const read = await ctx.client.nixie.read({});

  expect(read).toStrictEqual({ ...paused, features: [] });
});

test('#nixie.resume resumes nixie, and writes the session as the actor', async () => {
  const ctx = await setupTest();

  await ctx.client.nixie.pause({ clientActionID: '4b2d6f8a-1c3e-4a5b-9d7f-0e2c4a6b8d1f' });

  const resumed = await ctx.client.nixie.resume({
    clientActionID: '7c1e3a5b-9d2f-4b6a-8e0c-2f4a6b8d1c3e',
  });

  const records = await ctx.readNixieRecords();

  expect(resumed).toStrictEqual({ paused: null });

  expect(records.map((read) => [read.record.kind, read.record.payload]).at(-1)).toStrictEqual([
    'nixie.resumed',
    { by: ctx.laptop.caller.identityID },
  ]);
});

test('#nixie.resume gives null and writes nothing while nixie runs', async () => {
  const ctx = await setupTest();

  const resumed = await ctx.client.nixie.resume({
    clientActionID: '7c1e3a5b-9d2f-4b6a-8e0c-2f4a6b8d1c3e',
  });

  const records = await ctx.readNixieRecords();

  expect(resumed).toStrictEqual({ paused: null });
  expect(records).toStrictEqual([]);
});

test('#nixie.pause answers a replayed client action ID with the stored result, writing once', async () => {
  const ctx = await setupTest();

  const input = { clientActionID: '4b2d6f8a-1c3e-4a5b-9d7f-0e2c4a6b8d1f' };

  const first = await ctx.client.nixie.pause(input);

  ctx.clock.advance(60_000);

  const replayed = await ctx.client.nixie.pause(input);
  const records = await ctx.readNixieRecords();

  expect(replayed).toStrictEqual(first);
  expect(records).toHaveLength(1);
});

test('#nixie.resume refuses a client action ID that a pause used', async () => {
  const ctx = await setupTest();

  const clientActionID = '4b2d6f8a-1c3e-4a5b-9d7f-0e2c4a6b8d1f';

  await ctx.client.nixie.pause({ clientActionID });

  const reused = ctx.client.nixie.resume({ clientActionID });

  await Promise.allSettled([reused]);

  expect(reused).rejects.toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
});

test('#nixie.pause refuses a client action ID that another session used', async () => {
  const ctx = await setupTest();

  const clientActionID = '4b2d6f8a-1c3e-4a5b-9d7f-0e2c4a6b8d1f';

  const phone = await createDeviceSession(ctx.context, 'phone');

  await ctx.client.nixie.pause({ clientActionID });

  const reused = buildTestClient(ctx.url, phone.token).nixie.pause({ clientActionID });

  await Promise.allSettled([reused]);

  expect(reused).rejects.toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
});

test('#nixie.pause refuses a session that was revoked after it signed in, and writes nothing', async () => {
  const ctx = await setupTest();

  await ctx.client.sessions.revoke({
    clientActionID: '9a1c3e5b-7d2f-4a6b-8c0e-1f3a5b7c9d2e',
    sessionID: ctx.laptop.sessionID,
  });

  const refused = ctx.client.nixie.pause({
    clientActionID: '4b2d6f8a-1c3e-4a5b-9d7f-0e2c4a6b8d1f',
  });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

  const records = await ctx.readNixieRecords();

  expect(records).toStrictEqual([]);
});

test('#tasks.list marks each task as paused by nixie while it is paused', async () => {
  const ctx = await setupTest();

  const taskID = 'k3x9m2p7qa';

  await ctx.writeStartedTask(taskID);
  await ctx.client.nixie.pause({ clientActionID: '4b2d6f8a-1c3e-4a5b-9d7f-0e2c4a6b8d1f' });

  const listed = await ctx.client.tasks.list({});
  const read = await ctx.client.tasks.read({ taskID });

  expect(listed.tasks.map((task) => [task.taskID, task.isPausedByNixie])).toStrictEqual([
    [taskID, true],
  ]);

  expect(read.isPausedByNixie).toBeTrue();
  expect(read.state).toBe('ready');
});

test('#tasks.list marks no task as paused by nixie while nixie runs', async () => {
  const ctx = await setupTest();

  const taskID = 'k3x9m2p7qa';

  await ctx.writeStartedTask(taskID);

  const read = await ctx.client.tasks.read({ taskID });

  expect(read.isPausedByNixie).toBeFalse();
});

test('#tasks.list leaves a task that its own resume exempted unmarked, and marks the rest', async () => {
  const ctx = await setupTest();

  const resumedID = 'k3x9m2p7qa';
  const otherID = 'm5t8w2n6rb';

  await ctx.writeStartedTask(resumedID);
  await ctx.writeStartedTask(otherID);
  await ctx.client.nixie.pause({ clientActionID: '4b2d6f8a-1c3e-4a5b-9d7f-0e2c4a6b8d1f' });

  await ctx.client.tasks.resume({
    clientActionID: '7c1e3a5b-9d2f-4b6a-8e0c-2f4a6b8d1c3e',
    taskID: resumedID,
  });

  const listed = await ctx.client.tasks.list({});

  const pausedByID = Object.fromEntries(
    listed.tasks.map((task) => [task.taskID, task.isPausedByNixie]),
  );

  expect(pausedByID).toStrictEqual({ [resumedID]: false, [otherID]: true });
});

test('#nixie.read gives the cause restore for a restore pause', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, (tx) =>
    pauseNixieInTransaction(tx, ctx.context.log, {
      cause: 'restore',
      recoveryID: 'recovery-a',
      by: null,
      definitions: ctx.context.definitions(),
    }),
  );

  const read = await ctx.client.nixie.read({});

  expect(read).toStrictEqual({
    paused: { cause: 'restore', since: expect.toBeValidDate() },
    features: [],
  });
});
