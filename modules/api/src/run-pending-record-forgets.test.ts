import { expect, mock, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { runPendingRecordForgets } from './run-pending-record-forgets';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import type { CleanupRecordSessions } from './types';
import { writeOwnerMessage } from './write-owner-message';
import { writeRecordForget } from './write-record-forget';

async function setupTest() {
  const api = await startTestAPI();

  // boot data: a forget is a checked action of a signed-in device
  const laptop = await createDeviceSession(api.context, 'laptop');

  return { ...api, laptop };
}

test('it finishes every forget that began before the session cleanup was in place, oldest first', async () => {
  const ctx = await setupTest();

  const cleanupSessions = mock<CleanupRecordSessions>(() => Promise.resolve());

  const [first, second] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'The locker code is 2291.' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'And the bike lock is 7734.' },
    },
  ]);

  invariant(first && second);

  await writeRecordForget(ctx.context, ctx.laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: second.sequence,
  });

  await writeRecordForget(ctx.context, ctx.laptop.caller, {
    clientActionID: '9a3e6c21-4b7d-4f8a-b2c5-1d0e7f9a6b34',
    thread: 'conversation',
    sequence: first.sequence,
  });

  await runPendingRecordForgets({ ...ctx.context, readSessionCleanup: () => cleanupSessions });

  const forgotten = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['record.forgotten'],
  });

  expect(cleanupSessions.mock.calls).toStrictEqual([
    [{ recordSequence: second.sequence }],
    [{ recordSequence: first.sequence }],
  ]);

  expect(forgotten.map((entry) => entry.record.payload)).toStrictEqual([
    { recordSequence: second.sequence },
    { recordSequence: first.sequence },
  ]);
});

test('it never runs the session cleanup again for a forget that finished', async () => {
  const ctx = await setupTest();

  const cleanupSessions = mock<CleanupRecordSessions>(() => Promise.resolve());

  const sent = await writeOwnerMessage(ctx.context, ctx.laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'The locker code is 2291.',
    spans: [],
  });

  invariant(sent.status === 'written');

  await writeRecordForget(
    { ...ctx.context, readSessionCleanup: () => () => Promise.resolve() },
    ctx.laptop.caller,
    {
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      thread: 'conversation',
      sequence: sent.sequence,
    },
  );

  await runPendingRecordForgets({ ...ctx.context, readSessionCleanup: () => cleanupSessions });

  expect(cleanupSessions).not.toHaveBeenCalled();
});
