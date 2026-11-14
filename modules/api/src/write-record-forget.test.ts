import { expect, mock, test } from 'bun:test';
import {
  readRecordAttachments,
  readRecords,
  runProjectionRebuild,
  writeRecords,
} from '@heynixie/log';
import { readTestRecordAttachmentRows } from '@heynixie/log/test-utils';
import { createConversationTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { readThreadPage } from './read-thread-page';
import { createDeviceSession } from './test-utils/create-device-session';
import { seedTaskStartCall } from './test-utils/seed-task-start-call';
import { startTestAPI } from './test-utils/start-test-api';
import type { CleanupRecordSessions } from './types';
import { writeOwnerMessage } from './write-owner-message';
import { writeRecordForget } from './write-record-forget';
import { writeSessionRevocation } from './write-session-revocation';

async function setupTest() {
  const api = await startTestAPI();

  return {
    ...api,
    readRecordsAfter: async (sequence: number) => {
      const entries = await readRecords(api.context.log, { afterSequence: sequence - 1 });

      return entries.map((entry) => entry.record);
    },
  };
}

test('it forgets your message, so its text reads as a gap in the thread and after a log rebuild', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const sent = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'The locker code is 2291.',
    spans: [],
  });

  invariant(sent.status === 'written');

  await writeRecordForget(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: sent.sequence,
  });

  const live = await readThreadPage(ctx.context, { thread: 'conversation' });

  await runProjectionRebuild(ctx.context.log);

  const rebuilt = await readThreadPage(ctx.context, { thread: 'conversation' });

  const gap = {
    isRemoved: true as const,
    kind: 'owner_message',
    recordedAt: expect.toBeValidDate(),
    sequence: sent.sequence,
    thread: 'conversation',
  };

  expect(live?.records.find((record) => record.sequence === sent.sequence)).toStrictEqual(gap);
  expect(rebuilt?.records.find((record) => record.sequence === sent.sequence)).toStrictEqual(gap);
});

test('it forgets the images of your message, whose sealed bytes then decrypt in no copy of the database', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const sent = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'Two drafts of the porch sign.',
    spans: [],
    images: [
      { mediaType: 'image/png', bytes: new TextEncoder().encode('Porch-image-A') },
      { mediaType: 'image/jpeg', bytes: new TextEncoder().encode('Porch-image-B') },
    ],
  });

  invariant(sent.status === 'written');

  const before = await readRecordAttachments(ctx.context.log, [sent.sequence]);

  await writeRecordForget(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: sent.sequence,
  });

  const after = await readRecordAttachments(ctx.context.log, [sent.sequence]);
  const attachments = await readTestRecordAttachmentRows(ctx.writer);

  const sealed = attachments.filter((row) => row.sequence === sent.sequence);

  expect(before.get(sent.sequence)).toStrictEqual({
    status: 'readable',
    attachments: [
      new TextEncoder().encode('Porch-image-A'),
      new TextEncoder().encode('Porch-image-B'),
    ],
  });

  expect(after.get(sent.sequence)).toStrictEqual({ status: 'shredded' });

  expect(
    sealed.map((row) => new TextDecoder().decode(row.sealed).includes('Porch-image-')),
  ).toStrictEqual([false, false]);
});

test("it forgets a reply of the conversation's model", async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const [reply] = await writeRecords(ctx.context.log, [
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Your locker code is 2291.' },
    },
  ]);

  invariant(reply);

  const result = await writeRecordForget(ctx.context, laptop.caller, {
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

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const cleanupSessions = mock<CleanupRecordSessions>(() => Promise.resolve());

  const sent = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'The locker code is 2291.',
    spans: [],
  });

  invariant(sent.status === 'written');

  await writeRecordForget(
    { ...ctx.context, readSessionCleanup: () => cleanupSessions },
    laptop.caller,
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

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const sent = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'The locker code is 2291.',
    spans: [],
  });

  invariant(sent.status === 'written');

  await writeRecordForget(ctx.context, laptop.caller, {
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

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const cleanupSessions = mock<CleanupRecordSessions>(() => Promise.resolve());

  const sent = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'The locker code is 2291.',
    spans: [],
  });

  invariant(sent.status === 'written');

  const first = await writeRecordForget(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: sent.sequence,
  });

  const retry = await writeRecordForget(
    { ...ctx.context, readSessionCleanup: () => cleanupSessions },
    laptop.caller,
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

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const sent = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'The locker code is 2291.',
    spans: [],
  });

  invariant(sent.status === 'written');

  const first = await writeRecordForget(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: sent.sequence,
  });

  const second = await writeRecordForget(ctx.context, laptop.caller, {
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

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const sent = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'The locker code is 2291.',
    spans: [],
  });

  const other = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '3c8f1a52-7d2e-4b9c-8e6f-0a4d2b7c9e15',
    thread: 'conversation',
    text: 'And the bike lock is 7734.',
    spans: [],
  });

  invariant(sent.status === 'written' && other.status === 'written');

  await writeRecordForget(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: sent.sequence,
  });

  const result = await writeRecordForget(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: other.sequence,
  });

  expect(result).toStrictEqual({ status: 'reused' });
});

test("it refuses another device's retry of the action", async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const phone = await createDeviceSession(ctx.context, 'phone');

  const sent = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'The locker code is 2291.',
    spans: [],
  });

  invariant(sent.status === 'written');

  await writeRecordForget(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: sent.sequence,
  });

  const result = await writeRecordForget(ctx.context, phone.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: sent.sequence,
  });

  expect(result).toStrictEqual({ status: 'reused' });
});

test('it refuses a sequence that names a message on another thread', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const sent = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'The locker code is 2291.',
    spans: [],
  });

  invariant(sent.status === 'written');

  const result = await writeRecordForget(ctx.context, laptop.caller, {
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
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const [call] = await writeRecords(ctx.context.log, [
    {
      kind: 'tool_called',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { input: { url: 'https://lockers.test/' } },
    },
  ]);

  invariant(call);

  const result = await writeRecordForget(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: call.sequence,
  });

  expect(result).toStrictEqual({ status: 'not_found' });
});

test('it refuses a forget from a session revoked after the call resolved it', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const sent = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'The locker code is 2291.',
    spans: [],
  });

  invariant(sent.status === 'written');

  await writeSessionRevocation(ctx.context, laptop.caller, {
    clientActionID: '9a3e6c21-4b7d-4f8a-b2c5-1d0e7f9a6b34',
    sessionID: laptop.sessionID,
  });

  const result = await writeRecordForget(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: sent.sequence,
  });

  const [message] = await ctx.readRecordsAfter(sent.sequence);

  expect(result).toStrictEqual({ status: 'unauthorized' });
  expect(message?.erasable.status).toBe('readable');
});

test("it forgets a started task's brief with the starter's recorded task.start call, and rebuilds the sessions of both", async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const started = await seedTaskStartCall(ctx.context, {
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const cleanupSessions = mock<CleanupRecordSessions>(() => Promise.resolve());

  const result = await writeRecordForget(
    { ...ctx.context, readSessionCleanup: () => cleanupSessions },
    laptop.caller,
    {
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      thread: started.taskID,
      sequence: started.briefSequence,
    },
  );

  const entries = await readRecords(ctx.context.log, {
    afterSequence: 0,
    sequences: [started.callSequence, started.resultSequence, started.briefSequence],
  });

  const [call, brief, outcome] = entries.map((entry) => entry.record);

  expect(result).toStrictEqual({ status: 'forgotten', forgottenAt: expect.toBeNumber() });
  expect(brief?.erasable).toStrictEqual({ status: 'shredded' });
  expect(call?.erasable).toStrictEqual({ status: 'shredded' });
  expect(outcome?.erasable.status).toBe('readable');

  expect(cleanupSessions.mock.calls).toStrictEqual([
    [{ recordSequence: started.briefSequence }],
    [{ recordSequence: started.callSequence }],
  ]);
});

test("it leaves the text of another started task's call readable when it forgets a brief", async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const first = await seedTaskStartCall(ctx.context, {
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const [other] = await writeRecords(ctx.context.log, [
    {
      kind: 'tool_called',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { callID: 'call-2', runID: 'conversation', toolUseID: null, tool: 'task.start' },
      erasable: { input: { name: 'Moon phases', brief: 'List the moon phases for May.' } },
    },
  ]);

  invariant(other);

  await writeRecordForget(
    { ...ctx.context, readSessionCleanup: () => () => Promise.resolve() },
    laptop.caller,
    {
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      thread: first.taskID,
      sequence: first.briefSequence,
    },
  );

  const [kept] = await readRecords(ctx.context.log, {
    afterSequence: 0,
    sequences: [other.sequence],
  });

  expect(kept?.record.erasable).toStrictEqual({
    status: 'readable',
    fields: { input: { name: 'Moon phases', brief: 'List the moon phases for May.' } },
  });
});

test('it forgets a task message that is no brief with no call of the starter', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const started = await seedTaskStartCall(ctx.context, {
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const [report] = await writeRecords(ctx.context.log, [
    {
      kind: 'task_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        messageID: 'r7k2',
        from: started.taskID,
        to: 'conversation',
        kind: 'report',
        replyTo: null,
        onBehalfOf: [],
        hop: 1,
        hopLimit: 20,
        wake: true,
        woke: true,
        opensWait: false,
        source: `task:${started.taskID}`,
      },
      erasable: { body: 'The high tide is at 06:10.' },
    },
  ]);

  invariant(report);

  const cleanupSessions = mock<CleanupRecordSessions>(() => Promise.resolve());

  await writeRecordForget(
    { ...ctx.context, readSessionCleanup: () => cleanupSessions },
    laptop.caller,
    {
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      thread: 'conversation',
      sequence: report.sequence,
    },
  );

  const [call] = await readRecords(ctx.context.log, {
    afterSequence: 0,
    sequences: [started.callSequence],
  });

  expect(call?.record.erasable.status).toBe('readable');
  expect(cleanupSessions).toHaveBeenCalledExactlyOnceWith({ recordSequence: report.sequence });
});
