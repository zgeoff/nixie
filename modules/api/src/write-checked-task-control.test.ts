import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { createConversationTask } from '@heynixie/tasks';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import type { APITables } from './types';
import { writeCheckedTaskControl } from './write-checked-task-control';

test.each([
  ['revoked after it signed in', 0, 0],
  ['idle past the session limit', null, 31 * 24 * 60 * 60 * 1000],
] as const)(
  'it refuses a pause from an identity %s, and writes nothing',
  async (_label, revokedAt, idleMs) => {
    const api = await startTestAPI();

    await createConversationTask(api.context);

    const laptop = await createDeviceSession(api.context, 'laptop');

    await withWriteTransaction(api.writer, (tx) =>
      tx
        .$extendTables<APITables>()
        .updateTable('identities')
        .set({ revoked_at: revokedAt, last_seen_at: api.clock.now() - idleMs })
        .where('identity_id', '=', laptop.caller.identityID)
        .execute(),
    );

    const controlled = await writeCheckedTaskControl(api.context, laptop.caller, {
      clientActionID: '4b2d6f8a-1c3e-4a5b-9d7f-0e2c4a6b8d1f',
      taskID: 'conversation',
      control: 'pause',
    });

    const written = await readRecords(api.context.log, {
      afterSequence: 0,
      kinds: ['task.paused', 'task.pause_requested'],
    });

    expect(controlled).toStrictEqual({ status: 'unauthorized' });
    expect(written).toStrictEqual([]);
  },
);

test('it refuses a pause from an identity that never existed, and writes nothing', async () => {
  const api = await startTestAPI();

  await createConversationTask(api.context);

  const controlled = await writeCheckedTaskControl(
    api.context,
    {
      identityID: '9e7c5a3b-2d4f-4b6a-8c0e-1f3a5b7c9d2e',
      channel: 'web',
      label: 'laptop',
      pairedAt: api.clock.now(),
      lastSeenAt: api.clock.now(),
    },
    {
      clientActionID: '4b2d6f8a-1c3e-4a5b-9d7f-0e2c4a6b8d1f',
      taskID: 'conversation',
      control: 'pause',
    },
  );

  const written = await readRecords(api.context.log, {
    afterSequence: 0,
    kinds: ['task.paused', 'task.pause_requested'],
  });

  expect(controlled).toStrictEqual({ status: 'unauthorized' });
  expect(written).toStrictEqual([]);
});

test('it pauses a task for a live identity', async () => {
  const api = await startTestAPI();

  await createConversationTask(api.context);

  const laptop = await createDeviceSession(api.context, 'laptop');

  const controlled = await writeCheckedTaskControl(api.context, laptop.caller, {
    clientActionID: '4b2d6f8a-1c3e-4a5b-9d7f-0e2c4a6b8d1f',
    taskID: 'conversation',
    control: 'pause',
  });

  expect(controlled).toStrictEqual({
    status: 'controlled',
    taskID: 'conversation',
    state: 'paused',
    isPauseRequested: false,
    controlledAt: api.clock.now(),
  });
});
