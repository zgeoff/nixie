import { expect, mock, test } from 'bun:test';
import { claimAction, runActionAttempt } from '@heynixie/actions';
import { CodeSandboxDestroyError } from '@heynixie/connectors';
import {
  readRecordAttachments,
  readRecords,
  runProjectionRebuild,
  writeRecords,
} from '@heynixie/log';
import { readTestRecordAttachmentRows } from '@heynixie/log/test-utils';
import { momentKeptCodec } from '@heynixie/memory';
import { createConversationTask, taskRunEndedCodec, taskRunOpenedCodec } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { writeOwnerMessage } from '../kept/write-owner-message';
import { buildSeeder } from '../test-utils/build-seeder';
import { createDeviceSession } from '../test-utils/create-device-session';
import { seedTaskStartCall } from '../test-utils/seed-task-start-call';
import { startTestAPI } from '../test-utils/start-test-api';
import type { CleanupRecordSessions } from '../types';
import { writeSessionRevocation } from '../utils/write-session-revocation';
import { readThreadPage } from './read-thread-page';
import { writeRecordForget } from './write-record-forget';

async function setupTest() {
  const api = await startTestAPI();

  return {
    ...api,
    seed: buildSeeder(api),
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

test.each<[string, 'model.turn_ended' | 'sandbox.slept']>([
  ['a turn end', 'model.turn_ended'],
  ['a sandbox sleep', 'sandbox.slept'],
])('it refuses a sequence that names %s, which holds no text of its own', async (_label, kind) => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const [record] = await writeRecords(ctx.context.log, [
    { kind, definitions: { snapshotHash: 'sha256:test' }, thread: 'conversation' },
  ]);

  invariant(record);

  const result = await writeRecordForget(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: record.sequence,
  });

  expect(result).toStrictEqual({ status: 'not_found' });
});

test("it forgets a tool result inside a moment's span, and refuses the moment's own record and a memory item's own record", async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const [call, result] = await writeRecords(ctx.context.log, [
    {
      kind: 'tool_called',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { input: { url: 'https://lockers.test/' } },
    },
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { page: 'The locker code is 2291.' },
    },
  ]);

  invariant(call && result);

  const [moment, flag] = await writeRecords(ctx.context.log, [
    {
      kind: 'moment_kept',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: momentKeptCodec.encode({
        momentID: crypto.randomUUID(),
        shortID: 'm4k9x2q7ab',
        thread: 'conversation',
        firstSequence: call.sequence,
        lastSequence: result.sequence,
        keptBy: 'model',
        keptThread: 'conversation',
        model: 'test-model',
      }),
      erasable: { title: 'The locker code' },
    },
    {
      kind: 'memory.image_offered',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { messageSequence: call.sequence, image: 1, runID: 'run-offer' },
      erasable: { text: 'A photo of the spare key in the shed.' },
    },
  ]);

  invariant(moment && flag);

  const forget = (sequence: number, clientActionID: string) =>
    writeRecordForget(ctx.context, laptop.caller, {
      clientActionID,
      thread: 'conversation',
      sequence,
    });

  const forgotten = await forget(result.sequence, '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85');
  const refusedMoment = await forget(moment.sequence, '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a86');
  const refusedItem = await forget(flag.sequence, '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a87');
  const records = await ctx.readRecordsAfter(call.sequence);

  expect(forgotten).toStrictEqual({ status: 'forgotten', forgottenAt: expect.toBeNumber() });
  expect(refusedMoment).toStrictEqual({ status: 'not_found' });
  expect(refusedItem).toStrictEqual({ status: 'not_found' });

  expect(records.map((record) => [record.sequence, record.erasable.status])).toStrictEqual([
    [call.sequence, 'readable'],
    [result.sequence, 'shredded'],
    [moment.sequence, 'readable'],
    [flag.sequence, 'readable'],
    [expect.any(Number), 'none'],
  ]);
});

test('it refuses the forget of a queued action that has not run, and accepts the same forget once it ran', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const step = await ctx.seed.conversationStep();
  const action = await ctx.seed.action({ step: step.claim });

  const input = {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: action.queued_sequence,
  };

  const refused = await writeRecordForget(ctx.context, laptop.caller, input);
  const recordsAfterRefusal = await ctx.readRecordsAfter(action.queued_sequence + 1);
  const lease = await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(lease);

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([
      [action.tool, { run: () => Promise.resolve({ kind: 'success', result: {} }) }],
    ]),
    leaseMs: 60_000,
  });

  const accepted = await writeRecordForget(ctx.context, laptop.caller, input);

  expect(refused).toStrictEqual({ status: 'action_not_finished' });
  expect(recordsAfterRefusal.map((record) => record.kind)).not.toContain('record.forget_started');
  expect(accepted).toStrictEqual({ status: 'forgotten', forgottenAt: expect.toBeNumber() });
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

test('it forgets the request and the end of a report with its delivered message, and rebuilds the sessions of each', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const started = await seedTaskStartCall(ctx.context, {
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const written = await writeRecords(ctx.context.log, [
    {
      kind: 'task.run_opened',
      definitions: { snapshotHash: 'sha256:test' },
      thread: started.taskID,
      payload: taskRunOpenedCodec.encode({
        taskID: started.taskID,
        runID: 'run-a',
        openedByStep: 'k:1',
        origin: { kind: 'brief', sequence: null },
        definitionID: null,
        definitionHash: null,
        triggerKey: null,
        carriesRunID: null,
        briefID: null,
        report: { mode: 'wake', target: 'conversation' },
        reportShape: null,
        limits: { turns: 25, dollars: 2, calls: {} },
      }),
    },
    {
      kind: 'task.run_report_requested',
      definitions: { snapshotHash: 'sha256:test' },
      thread: started.taskID,
      payload: { taskID: started.taskID, runID: 'run-a', stepKey: 'k:1', reportID: 'r7k2' },
      erasable: { summary: 'The high tide is at 06:10.' },
    },
    {
      kind: 'task.run_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: started.taskID,
      payload: taskRunEndedCodec.encode({
        taskID: started.taskID,
        runID: 'run-a',
        cause: 'reported',
        detail: {},
        endedBy: 'step:k:1',
        definitionID: null,
        triggerKey: null,
        carriesRunID: null,
        used: { turns: 1, dollars: 0, calls: {} },
        reportID: 'r7k2',
        reportTo: 'conversation',
        delivery: 'wake',
      }),
      erasable: { body: 'The high tide is at 06:10.' },
    },
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

  const [, requested, ended, delivered] = written;

  invariant(requested && ended && delivered);

  const cleanupSessions = mock<CleanupRecordSessions>(() => Promise.resolve());

  await writeRecordForget(
    { ...ctx.context, readSessionCleanup: () => cleanupSessions },
    laptop.caller,
    {
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      thread: 'conversation',
      sequence: delivered.sequence,
    },
  );

  const entries = await readRecords(ctx.context.log, {
    afterSequence: 0,
    sequences: [requested.sequence, ended.sequence, delivered.sequence],
  });

  expect(entries.map((entry) => entry.record.erasable)).toStrictEqual([
    { status: 'shredded' },
    { status: 'shredded' },
    { status: 'shredded' },
  ]);

  expect(cleanupSessions.mock.calls).toStrictEqual([
    [{ recordSequence: delivered.sequence }],
    [{ recordSequence: requested.sequence }],
    [{ recordSequence: ended.sequence }],
  ]);
});

test('it fails the forget with the destroy sentence when a code sandbox will not go, and a retry with the same action ID finishes it', async () => {
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

  const input = {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: sent.sequence,
  };

  const failing = {
    ...ctx.context,
    readSessionCleanup: () => () => Promise.resolve(),
    readCodeCleanup: () => () => Promise.reject(new CodeSandboxDestroyError()),
  };

  const [failed] = await Promise.allSettled([writeRecordForget(failing, laptop.caller, input)]);

  const retried = await writeRecordForget(
    {
      ...ctx.context,
      readSessionCleanup: () => () => Promise.resolve(),
      readCodeCleanup: () => () => Promise.resolve(),
    },
    laptop.caller,
    input,
  );

  const page = await readThreadPage(ctx.context, { thread: 'conversation' });

  const gap = page?.records.find((record) => record.sequence === sent.sequence);

  expect(failed).toMatchObject({
    status: 'rejected',
    reason: {
      message: 'nixie could not destroy a code sandbox that holds this text. Try the forget again.',
    },
  });

  expect(retried.status).toBe('forgotten');
  expect(gap).toMatchObject({ isRemoved: true });
});
