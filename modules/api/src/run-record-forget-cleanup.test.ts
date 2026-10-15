import { expect, mock, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { runRecordForgetCleanup } from './run-record-forget-cleanup';
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

test('it commits record.forgotten once when two cleanups of the same forget overlap', async () => {
  const ctx = await setupTest();

  const sent = await writeOwnerMessage(ctx.context, ctx.laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'The locker code is 2291.',
    spans: [],
  });

  invariant(sent.status === 'written');

  await writeRecordForget(ctx.context, ctx.laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: sent.sequence,
  });

  const context = { ...ctx.context, readSessionCleanup: () => () => Promise.resolve() };

  await Promise.all([
    runRecordForgetCleanup(context, sent.sequence),
    runRecordForgetCleanup(context, sent.sequence),
  ]);

  const forgotten = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['record.forgotten'],
  });

  expect(forgotten).toHaveLength(1);
});

test('it skips the session cleanup of a record already forgotten', async () => {
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

  await runRecordForgetCleanup(
    { ...ctx.context, readSessionCleanup: () => cleanupSessions },
    sent.sequence,
  );

  expect(cleanupSessions).not.toHaveBeenCalled();
});
