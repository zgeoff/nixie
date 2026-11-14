import { expect, mock, test } from 'bun:test';
import { readRecordKeys, readRecords, withWriteTransaction, writeRecords } from '@heynixie/log';
import { readTestRecordRows, removeTestRecordKey } from '@heynixie/log/test-utils';
import { writeImageOfferRecord } from '@heynixie/memory/test-utils';
import { createConversationTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import type { ForgetTarget } from '../forget/write-forget-start';
import { writeForgetStart } from '../forget/write-forget-start';
import { writeOwnerMessage } from '../kept/write-owner-message';
import { createDeviceSession } from '../test-utils/create-device-session';
import { seedTaskStartCall, seedUnansweredStartCall } from '../test-utils/seed-task-start-call';
import { startTestAPI } from '../test-utils/start-test-api';
import type { CleanupRecordSessions } from '../types';
import { readBriefStartCalls } from './read-brief-start-calls';
import { runPendingRecordForgets } from './run-pending-record-forgets';
import { runRecordForgetCleanup } from './run-record-forget-cleanup';
import { writeRecordForget } from './write-record-forget';

async function setupTest() {
  const api = await startTestAPI();

  return {
    ...api,
    startForget: async (target: ForgetTarget) => {
      const startCalls = await readBriefStartCalls(api.context, target.sequence);

      await withWriteTransaction(api.context.log.writer, (tx) =>
        writeForgetStart(tx, api.context, target, startCalls),
      );
    },
  };
}

test("it leaves no readable copy of an earlier release's image offer once its image message is forgotten", async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const sent = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'Our new puppy',
    spans: [{ start: 0, end: 13, source: 'typed' }],
    images: [{ mediaType: 'image/png', bytes: new TextEncoder().encode('Puppy-image') }],
  });

  invariant(sent.status === 'written');

  const offer = await writeImageOfferRecord(ctx.context.log, {
    thread: 'conversation',
    messageSequence: sent.sequence,
    image: 1,
    text: 'The owner has a beagle called Biscuit',
  });

  await writeRecordForget(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: sent.sequence,
  });

  const keys = await readRecordKeys(ctx.context.log, [offer.keyID]);
  const entries = await readRecords(ctx.context.log, { afterSequence: 0, limit: 1000 });

  expect(keys.has(offer.keyID)).toBe(false);
  expect(JSON.stringify(entries)).not.toInclude('Biscuit');
});

test('it commits record.forgotten once when two cleanups of the same forget overlap', async () => {
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
    { ...ctx.context, readSessionCleanup: () => () => Promise.resolve() },
    laptop.caller,
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

test("it finishes a brief's forget on the pending-forget rerun after a crash that destroyed only the brief's key", async () => {
  const ctx = await setupTest();

  const started = await seedTaskStartCall(ctx.context, {
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  await ctx.startForget({ thread: started.taskID, sequence: started.briefSequence });

  await removeTestRecordKey(ctx.context.log, started.briefSequence);

  const cleanupSessions = mock<CleanupRecordSessions>(() => Promise.resolve());

  await runPendingRecordForgets({ ...ctx.context, readSessionCleanup: () => cleanupSessions });

  const entries = await readRecords(ctx.context.log, {
    afterSequence: 0,
    sequences: [started.callSequence, started.resultSequence],
  });

  const forgotten = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['record.forgotten'],
  });

  expect(entries.map((entry) => entry.record.erasable.status)).toStrictEqual([
    'shredded',
    'readable',
  ]);

  expect(cleanupSessions.mock.calls).toStrictEqual([
    [{ recordSequence: started.briefSequence }],
    [{ recordSequence: started.callSequence }],
  ]);

  expect(forgotten).toHaveLength(1);
});

test('it removes the key of each recorded start call of a brief that a rerun of the starting step left', async () => {
  const ctx = await setupTest();

  const started = await seedTaskStartCall(ctx.context, {
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const [rerunCall] = await writeRecords(ctx.context.log, [
    {
      kind: 'tool_called',
      definitions: ctx.context.definitions(),
      thread: 'conversation',
      payload: { callID: 'call-2', runID: 'conversation', toolUseID: null, tool: 'task.start' },
      erasable: { input: { name: 'Tide tables', brief: 'Find the high tides for Saturday.' } },
    },
  ]);

  invariant(rerunCall);

  await writeRecords(ctx.context.log, [
    {
      kind: 'tool_result',
      definitions: ctx.context.definitions(),
      thread: 'conversation',
      parent: rerunCall.sequence,
      payload: {
        callID: 'call-2',
        runID: 'conversation',
        toolUseID: null,
        outcome: 'result',
        actionID: null,
        sources: {},
      },
      erasable: { result: { taskID: started.taskID, name: 'Tide tables', note: 'Started.' } },
    },
  ]);

  await ctx.startForget({ thread: started.taskID, sequence: started.briefSequence });

  const cleanupSessions = mock<CleanupRecordSessions>(() => Promise.resolve());

  await runRecordForgetCleanup(
    { ...ctx.context, readSessionCleanup: () => cleanupSessions },
    started.briefSequence,
  );

  const entries = await readRecords(ctx.context.log, {
    afterSequence: 0,
    sequences: [started.callSequence, rerunCall.sequence],
  });

  expect(entries.map((entry) => entry.record.erasable.status)).toStrictEqual([
    'shredded',
    'shredded',
  ]);

  expect(cleanupSessions).toHaveBeenCalledTimes(3);
});

test("it removes the key of the starter's start call when the process died before the call's result was recorded", async () => {
  const ctx = await setupTest();

  const started = await seedUnansweredStartCall(ctx.context, {
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  await ctx.startForget({ thread: started.taskID, sequence: started.briefSequence });

  const cleanupSessions = mock<CleanupRecordSessions>(() => Promise.resolve());

  await runRecordForgetCleanup(
    { ...ctx.context, readSessionCleanup: () => cleanupSessions },
    started.briefSequence,
  );

  const entries = await readRecords(ctx.context.log, {
    afterSequence: 0,
    sequences: [started.callSequence, started.briefSequence],
  });

  const forgotten = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['record.forgotten'],
  });

  expect(entries.map((entry) => entry.record.erasable.status)).toStrictEqual([
    'shredded',
    'shredded',
  ]);

  expect(cleanupSessions.mock.calls).toStrictEqual([
    [{ recordSequence: started.briefSequence }],
    [{ recordSequence: started.callSequence }],
  ]);

  expect(forgotten).toHaveLength(1);
});

test('it leaves the unanswered start call of a task with another name readable when it forgets a brief', async () => {
  const ctx = await setupTest();

  const started = await seedTaskStartCall(ctx.context, {
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const [other] = await writeRecords(ctx.context.log, [
    {
      kind: 'tool_called',
      definitions: ctx.context.definitions(),
      thread: 'conversation',
      payload: { callID: 'call-3', runID: 'conversation', toolUseID: null, tool: 'task.start' },
      erasable: { input: { name: 'Moon phases', brief: 'List the moon phases for May.' } },
    },
  ]);

  invariant(other);

  await ctx.startForget({ thread: started.taskID, sequence: started.briefSequence });

  await runRecordForgetCleanup(ctx.context, started.briefSequence);

  const [entry] = await readRecords(ctx.context.log, {
    afterSequence: 0,
    sequences: [other.sequence],
  });

  expect(entry?.record.erasable.status).toBe('readable');
});

test("it cleans the starter's session on the rerun of a forget whose unanswered start call already lost its key", async () => {
  const ctx = await setupTest();

  const started = await seedUnansweredStartCall(ctx.context, {
    name: 'Harbour survey',
    brief: 'List the sheltered anchorages.',
  });

  await ctx.startForget({ thread: started.taskID, sequence: started.briefSequence });

  await runRecordForgetCleanup(
    { ...ctx.context, readSessionCleanup: () => null },
    started.briefSequence,
  );

  const cleanupSessions = mock<CleanupRecordSessions>(() => Promise.resolve());

  await runRecordForgetCleanup(
    { ...ctx.context, readSessionCleanup: () => cleanupSessions },
    started.briefSequence,
  );

  expect(cleanupSessions.mock.calls).toStrictEqual([
    [{ recordSequence: started.briefSequence }],
    [{ recordSequence: started.callSequence }],
  ]);
});

test('it leaves an unanswered start call with the same name and another brief readable when the brief lost its key before the cleanup', async () => {
  const ctx = await setupTest();

  const started = await seedTaskStartCall(ctx.context, {
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const [other] = await writeRecords(ctx.context.log, [
    {
      kind: 'tool_called',
      definitions: ctx.context.definitions(),
      thread: 'conversation',
      payload: { callID: 'call-4', runID: 'conversation', toolUseID: null, tool: 'task.start' },
      erasable: { input: { name: 'Tide tables', brief: 'List the low tides for Sunday.' } },
    },
  ]);

  invariant(other);

  await ctx.startForget({ thread: started.taskID, sequence: started.briefSequence });

  await removeTestRecordKey(ctx.context.log, started.briefSequence);
  await runRecordForgetCleanup(ctx.context, started.briefSequence);

  const [entry] = await readRecords(ctx.context.log, {
    afterSequence: 0,
    sequences: [other.sequence],
  });

  expect(entry?.record.erasable.status).toBe('readable');
});

test.each([
  ['the conversation', 'conversation'],
  ['a started task', 'task-9f3k2m7q1x'],
])(
  'it deletes the key of a tool result on %s, cleans its sequence from the sessions, and commits record.forgotten',
  async (_label, thread) => {
    const ctx = await setupTest();

    const cleanupSessions = mock<CleanupRecordSessions>(() => Promise.resolve());

    const [result] = await writeRecords(ctx.context.log, [
      {
        kind: 'tool_result',
        definitions: { snapshotHash: 'sha256:test' },
        thread,
        erasable: { page: 'The locker code is 2291.' },
      },
    ]);

    invariant(result);

    const rows = await readTestRecordRows(ctx.context.log.writer);

    const keyID = rows.find((row) => row.sequence === result.sequence)?.key_id;

    invariant(keyID);

    await ctx.startForget({ thread, sequence: result.sequence });

    await runRecordForgetCleanup(
      { ...ctx.context, readSessionCleanup: () => cleanupSessions },
      result.sequence,
    );

    const keys = await readRecordKeys(ctx.context.log, [keyID]);

    const forgotten = await readRecords(ctx.context.log, {
      afterSequence: 0,
      kinds: ['record.forgotten'],
    });

    expect(keys.has(keyID)).toBe(false);
    expect(cleanupSessions).toHaveBeenCalledExactlyOnceWith({ recordSequence: result.sequence });

    expect(forgotten.map((entry) => [entry.record.thread, entry.record.payload])).toStrictEqual([
      [thread, { recordSequence: result.sequence }],
    ]);
  },
);
