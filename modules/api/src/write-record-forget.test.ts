import { expect, mock, test } from 'bun:test';
import { readRecords, runProjectionRebuild, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readThreadPage } from './read-thread-page';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import type { CleanupRecordSessions } from './types';
import { writeOwnerMessage } from './write-owner-message';
import { writeRecordForget } from './write-record-forget';
import { writeSessionRevocation } from './write-session-revocation';

async function setupTest() {
  const api = await startTestAPI();

  // boot data: a forget is a checked action of a signed-in device
  const laptop = await createDeviceSession(api.context, 'laptop');

  return {
    ...api,
    laptop,
    readRecordsAfter: async (sequence: number) => {
      const entries = await readRecords(api.context.log, { afterSequence: sequence - 1 });

      return entries.map((entry) => entry.record);
    },
  };
}

test('it forgets your message, so its text reads as a gap in the thread and after a log rebuild', async () => {
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

  const live = await readThreadPage(ctx.context, { thread: 'conversation' });

  await runProjectionRebuild(ctx.context.log);

  const rebuilt = await readThreadPage(ctx.context, { thread: 'conversation' });

  const gap = {
    kind: 'owner_message',
    recordedAt: expect.any(Date),
    sequence: sent.sequence,
    thread: 'conversation',
  };

  expect(live?.records.find((record) => record.sequence === sent.sequence)).toStrictEqual(gap);
  expect(rebuilt?.records.find((record) => record.sequence === sent.sequence)).toStrictEqual(gap);
});

test("it forgets a reply of the conversation's model", async () => {
  const ctx = await setupTest();

  const [reply] = await writeRecords(ctx.context.log, [
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Your locker code is 2291.' },
    },
  ]);

  invariant(reply);

  const result = await writeRecordForget(ctx.context, ctx.laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: reply.sequence,
  });

  const [forgotten] = await ctx.readRecordsAfter(reply.sequence);

  expect(result).toStrictEqual({ status: 'forgotten', forgottenAt: expect.toBeNumber() });
  expect(forgotten?.erasable).toStrictEqual({ status: 'shredded' });
});

test('it runs the session cleanup for the forgotten record, then commits record.forgotten', async () => {
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
    { ...ctx.context, readSessionCleanup: () => cleanupSessions },
    ctx.laptop.caller,
    {
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      thread: 'conversation',
      sequence: sent.sequence,
    },
  );

  const records = await ctx.readRecordsAfter(sent.sequence + 1);

  expect(cleanupSessions).toHaveBeenCalledExactlyOnceWith({ recordSequence: sent.sequence });

  expect(records).toMatchObject([
    {
      kind: 'record.forget_started',
      thread: 'conversation',
      payload: { recordSequence: sent.sequence },
    },
    {
      kind: 'record.forgotten',
      thread: 'conversation',
      payload: { recordSequence: sent.sequence },
    },
  ]);
});

test('it leaves the forget begun with the key gone while no session cleanup is in place', async () => {
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

  const [message, ...after] = await ctx.readRecordsAfter(sent.sequence);

  expect(message?.erasable).toStrictEqual({ status: 'shredded' });
  expect(after.map((record) => record.kind)).toStrictEqual(['record.forget_started']);
});

test('it finishes a begun forget on a retry once the session cleanup is in place', async () => {
  const ctx = await setupTest();

  const cleanupSessions = mock<CleanupRecordSessions>(() => Promise.resolve());

  const sent = await writeOwnerMessage(ctx.context, ctx.laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'The locker code is 2291.',
    spans: [],
  });

  invariant(sent.status === 'written');

  const first = await writeRecordForget(ctx.context, ctx.laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: sent.sequence,
  });

  const retry = await writeRecordForget(
    { ...ctx.context, readSessionCleanup: () => cleanupSessions },
    ctx.laptop.caller,
    {
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      thread: 'conversation',
      sequence: sent.sequence,
    },
  );

  const records = await ctx.readRecordsAfter(sent.sequence + 1);

  expect(retry).toStrictEqual(first);
  expect(cleanupSessions).toHaveBeenCalledExactlyOnceWith({ recordSequence: sent.sequence });

  expect(records.map((record) => record.kind)).toStrictEqual([
    'record.forget_started',
    'record.forgotten',
  ]);
});

test('it answers a forget of a record already forgetting with the first time and no second start', async () => {
  const ctx = await setupTest();

  const sent = await writeOwnerMessage(ctx.context, ctx.laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'The locker code is 2291.',
    spans: [],
  });

  invariant(sent.status === 'written');

  const first = await writeRecordForget(ctx.context, ctx.laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: sent.sequence,
  });

  const second = await writeRecordForget(ctx.context, ctx.laptop.caller, {
    clientActionID: '9a3e6c21-4b7d-4f8a-b2c5-1d0e7f9a6b34',
    thread: 'conversation',
    sequence: sent.sequence,
  });

  const records = await ctx.readRecordsAfter(sent.sequence + 1);

  expect(second).toStrictEqual(first);
  expect(records.map((record) => record.kind)).toStrictEqual(['record.forget_started']);
});

test('it refuses a client action ID that came before for another record', async () => {
  const ctx = await setupTest();

  const sent = await writeOwnerMessage(ctx.context, ctx.laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'The locker code is 2291.',
    spans: [],
  });

  const other = await writeOwnerMessage(ctx.context, ctx.laptop.caller, {
    clientMessageId: '3c8f1a52-7d2e-4b9c-8e6f-0a4d2b7c9e15',
    thread: 'conversation',
    text: 'And the bike lock is 7734.',
    spans: [],
  });

  invariant(sent.status === 'written' && other.status === 'written');

  await writeRecordForget(ctx.context, ctx.laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: sent.sequence,
  });

  const result = await writeRecordForget(ctx.context, ctx.laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: other.sequence,
  });

  expect(result).toStrictEqual({ status: 'reused' });
});

test('it refuses a sequence that names a message on another thread', async () => {
  const ctx = await setupTest();

  const sent = await writeOwnerMessage(ctx.context, ctx.laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'The locker code is 2291.',
    spans: [],
  });

  invariant(sent.status === 'written');

  const result = await writeRecordForget(ctx.context, ctx.laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'task-elsewhere',
    sequence: sent.sequence,
  });

  const [message] = await ctx.readRecordsAfter(sent.sequence);

  expect(result).toStrictEqual({ status: 'not_found' });
  expect(message?.erasable.status).toBe('readable');
});

test('it refuses a sequence that names a record other than a message or a reply', async () => {
  const ctx = await setupTest();

  const [call] = await writeRecords(ctx.context.log, [
    {
      kind: 'tool_called',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { input: { url: 'https://lockers.test/' } },
    },
  ]);

  invariant(call);

  const result = await writeRecordForget(ctx.context, ctx.laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: call.sequence,
  });

  expect(result).toStrictEqual({ status: 'not_found' });
});

test('it refuses a forget from a session revoked after the call resolved it', async () => {
  const ctx = await setupTest();

  const sent = await writeOwnerMessage(ctx.context, ctx.laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'The locker code is 2291.',
    spans: [],
  });

  invariant(sent.status === 'written');

  await writeSessionRevocation(ctx.context, ctx.laptop.caller, {
    clientActionID: '9a3e6c21-4b7d-4f8a-b2c5-1d0e7f9a6b34',
    sessionID: ctx.laptop.sessionID,
  });

  const result = await writeRecordForget(ctx.context, ctx.laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: sent.sequence,
  });

  const [message] = await ctx.readRecordsAfter(sent.sequence);

  expect(result).toStrictEqual({ status: 'unauthorized' });
  expect(message?.erasable.status).toBe('readable');
});
