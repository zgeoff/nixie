import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { createConversationTask, writeInboxRecords } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import type { APITables } from './types';
import { writeMessageMove } from './write-message-move';

test.each([
  ['revoked after it signed in', 0, 0],
  ['idle past the session limit', null, 31 * 24 * 60 * 60 * 1000],
] as const)(
  'it refuses a move from an identity %s, and writes nothing',
  async (_label, revokedAt, idleMs) => {
    const api = await startTestAPI();

    await createConversationTask(api.context);

    const laptop = await createDeviceSession(api.context, 'laptop');

    const [message] = await writeInboxRecords(api.context, [
      {
        kind: 'owner_message',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        contentSource: 'owner',
        erasable: { text: 'Find a plumber for the outside tap.' },
      },
    ]);

    invariant(message);

    await withWriteTransaction(api.writer, (tx) =>
      tx
        .$extendTables<APITables>()
        .updateTable('identities')
        .set({ revoked_at: revokedAt, last_seen_at: api.clock.now() - idleMs })
        .where('identity_id', '=', laptop.caller.identityID)
        .execute(),
    );

    const moved = await writeMessageMove(api.context, laptop.caller, {
      clientActionID: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
      thread: 'conversation',
      sequence: message.sequence,
      to: { kind: 'new', name: 'Plumber', brief: 'Books a plumber.' },
    });

    const written = await readRecords(api.context.log, {
      afterSequence: message.sequence,
      kinds: ['task.created', 'task.route_corrected', 'task.message_moved'],
    });

    expect(moved).toStrictEqual({ status: 'unauthorized' });
    expect(written).toStrictEqual([]);
  },
);

test('it refuses a move from an identity that never existed, and writes nothing', async () => {
  const api = await startTestAPI();

  await createConversationTask(api.context);

  const [message] = await writeInboxRecords(api.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      erasable: { text: 'Find a plumber for the outside tap.' },
    },
  ]);

  invariant(message);

  const moved = await writeMessageMove(
    api.context,
    {
      identityID: '0d3c2b1a-9f8e-4d7c-8b6a-5f4e3d2c1b0a',
      channel: 'web',
      label: 'laptop',
      pairedAt: api.clock.now(),
      lastSeenAt: api.clock.now(),
    },
    {
      clientActionID: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
      thread: 'conversation',
      sequence: message.sequence,
      to: { kind: 'new', name: 'Plumber', brief: 'Books a plumber.' },
    },
  );

  const written = await readRecords(api.context.log, {
    afterSequence: message.sequence,
    kinds: ['task.created', 'task.route_corrected', 'task.message_moved'],
  });

  expect(moved).toStrictEqual({ status: 'unauthorized' });
  expect(written).toStrictEqual([]);
});

test('it moves a message for a live identity', async () => {
  const api = await startTestAPI();

  await createConversationTask(api.context);

  const laptop = await createDeviceSession(api.context, 'laptop');

  const [message] = await writeInboxRecords(api.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      erasable: { text: 'Find a plumber for the outside tap.' },
    },
  ]);

  invariant(message);

  const moved = await writeMessageMove(api.context, laptop.caller, {
    clientActionID: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
    thread: 'conversation',
    sequence: message.sequence,
    to: { kind: 'new', name: 'Plumber', brief: 'Books a plumber.' },
  });

  expect(moved).toStrictEqual({
    status: 'moved',
    taskID: expect.toBeString(),
    movedAt: api.clock.now(),
  });
});
