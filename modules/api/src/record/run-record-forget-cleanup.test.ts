import { expect, mock, test } from 'bun:test';
import { seedImage } from '@heynixie/connectors/test-utils';
import {
  readRecordAttachments,
  readRecordKeys,
  readRecords,
  withWriteTransaction,
  writeRecords,
} from '@heynixie/log';
import {
  readTestRecordKeyRows,
  readTestRecordRows,
  removeTestRecordKey,
} from '@heynixie/log/test-utils';
import { recordForgetStartedCodec } from '@heynixie/memory';
import { writeImageOfferRecord } from '@heynixie/memory/test-utils';
import { createConversationTask } from '@heynixie/tasks';
import { startFaultPointFailure } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import type { ForgetTarget } from '../forget/write-forget-start';
import { writeForgetStart } from '../forget/write-forget-start';
import { writeOwnerMessage } from '../kept/write-owner-message';
import { createDeviceSession } from '../test-utils/create-device-session';
import { seedQuotedMemoryItems } from '../test-utils/seed-quoted-memory-items';
import { seedTaskStartCall, seedUnansweredStartCall } from '../test-utils/seed-task-start-call';
import { startTestAPI } from '../test-utils/start-test-api';
import { startTestMemoryForgets } from '../test-utils/start-test-memory-forgets';
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

test('it removes the key of an imported image when the message it was imported from is forgotten', async () => {
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

  const held = await seedImage(ctx.context.log, {
    image: 'k3x9m2p7qa',
    source: 'photo',
    sourceSequence: sent.sequence,
    bytes: new TextEncoder().encode('Imported-puppy'),
  });

  await writeRecordForget(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: sent.sequence,
  });

  const attachments = await readRecordAttachments(ctx.context.log, [held.sequence]);

  expect(attachments.get(held.sequence)?.status).not.toBe('readable');
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
    [{ recordSequence: started.callSequence }],
    [{ recordSequence: started.briefSequence }],
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
    [{ recordSequence: started.callSequence }],
    [{ recordSequence: started.briefSequence }],
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
    [{ recordSequence: started.callSequence }],
    [{ recordSequence: started.briefSequence }],
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

    invariant(typeof keyID === 'string' && keyID !== '');

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

test('it destroys the code sandboxes of the forgotten record before it deletes any key', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const [result] = await writeRecords(ctx.context.log, [
    {
      kind: 'tool_result',
      definitions: ctx.context.definitions(),
      thread: 'conversation',
      payload: {
        callID: 'call-1',
        runID: 'conversation',
        toolUseID: null,
        outcome: 'result',
        actionID: null,
        sources: {},
      },
      erasable: { result: { stdout: { text: 'north 412.50' } } },
    },
  ]);

  invariant(result);

  await ctx.startForget({ thread: 'conversation', sequence: result.sequence });

  const keysAtDestroy: number[] = [];

  const destroyCode = mock<(sequences: readonly number[]) => Promise<void>>(async () => {
    const keys = await readTestRecordKeyRows(ctx.context.log.writer);

    keysAtDestroy.push(keys.length);
  });

  await runRecordForgetCleanup(
    {
      ...ctx.context,
      readSessionCleanup: () => () => Promise.resolve(),
      readCodeCleanup: () => destroyCode,
    },
    result.sequence,
  );

  const keysAfter = await readTestRecordKeyRows(ctx.context.log.writer);

  expect(destroyCode.mock.calls).toStrictEqual([[[result.sequence]]]);
  expect(keysAtDestroy).toStrictEqual([1]);
  expect(keysAfter).toStrictEqual([]);
});

test('it deletes no key and writes no forgotten record when a code sandbox will not go, and a rerun finishes', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const [result] = await writeRecords(ctx.context.log, [
    {
      kind: 'tool_result',
      definitions: ctx.context.definitions(),
      thread: 'conversation',
      payload: {
        callID: 'call-1',
        runID: 'conversation',
        toolUseID: null,
        outcome: 'result',
        actionID: null,
        sources: {},
      },
      erasable: { result: { stdout: { text: 'north 412.50' } } },
    },
  ]);

  invariant(result);

  await ctx.startForget({ thread: 'conversation', sequence: result.sequence });

  const failing = {
    ...ctx.context,
    readSessionCleanup: () => () => Promise.resolve(),
    readCodeCleanup: () => () => Promise.reject(new Error('impd is down')),
  };

  const [failed] = await Promise.allSettled([runRecordForgetCleanup(failing, result.sequence)]);
  const keysAfterFailure = await readTestRecordKeyRows(ctx.context.log.writer);

  await runRecordForgetCleanup(
    {
      ...ctx.context,
      readSessionCleanup: () => () => Promise.resolve(),
      readCodeCleanup: () => () => Promise.resolve(),
    },
    result.sequence,
  );

  const keysAfterRerun = await readTestRecordKeyRows(ctx.context.log.writer);

  expect(failed).toMatchObject({ status: 'rejected', reason: new Error('impd is down') });
  expect(keysAfterFailure).toHaveLength(1);
  expect(keysAfterRerun).toStrictEqual([]);
});

test('it gives a forget that an earlier release began its purge set first, and purges each quoting item before record.forgotten', async () => {
  const api = await startTestAPI();
  const forgets = await startTestMemoryForgets(api.context);
  const seeded = await seedQuotedMemoryItems(api.context, forgets.memory);

  await writeRecords(api.context.log, [
    {
      kind: recordForgetStartedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: recordForgetStartedCodec.encode({ recordSequence: seeded.sequence }),
    },
  ]);

  await runRecordForgetCleanup(forgets.forgetContext, seeded.sequence);

  const entries = await readRecords(api.context.log, { afterSequence: 0 });
  const history = await forgets.memory.readHistory(seeded.quoting.itemID);

  expect(entries.map((entry) => entry.record.kind).slice(-4)).toStrictEqual([
    'memory.evidence_purge_started',
    'memory.evidence_purge_closed',
    'memory.evidence_purged',
    'record.forgotten',
  ]);

  expect(history?.versions).toMatchObject([
    { version: 1, status: 'shredded', isRemoved: true },
    { version: 2, status: 'readable', isRemoved: false },
  ]);
});

test('it writes nothing more when the cleanup of a forget that an earlier release began runs again', async () => {
  const api = await startTestAPI();
  const forgets = await startTestMemoryForgets(api.context);
  const seeded = await seedQuotedMemoryItems(api.context, forgets.memory);

  await writeRecords(api.context.log, [
    {
      kind: recordForgetStartedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: recordForgetStartedCodec.encode({ recordSequence: seeded.sequence }),
    },
  ]);

  await runRecordForgetCleanup(forgets.forgetContext, seeded.sequence);

  const first = await readRecords(api.context.log, { afterSequence: 0 });

  await runRecordForgetCleanup(forgets.forgetContext, seeded.sequence);

  const second = await readRecords(api.context.log, { afterSequence: 0 });

  expect(second).toHaveLength(first.length);
});

test.each(['record.forget.started', 'record.forget.purged'] as const)(
  'it finishes a forget that a crash cut short at %s, purging the quoting item before record.forgotten',
  async (faultPoint) => {
    const api = await startTestAPI();
    const forgets = await startTestMemoryForgets(api.context);
    const seeded = await seedQuotedMemoryItems(api.context, forgets.memory);

    await writeRecords(api.context.log, [
      {
        kind: recordForgetStartedCodec.kind,
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        payload: recordForgetStartedCodec.encode({ recordSequence: seeded.sequence }),
      },
    ]);

    startFaultPointFailure(faultPoint);

    const crash = await runRecordForgetCleanup(forgets.forgetContext, seeded.sequence).catch(
      (error: unknown) => error,
    );

    await runPendingRecordForgets(forgets.forgetContext);

    const entries = await readRecords(api.context.log, { afterSequence: 0 });
    const history = await forgets.memory.readHistory(seeded.quoting.itemID);

    expect(crash).toMatchObject({ message: `crashed at ${faultPoint}` });
    expect(entries.map((entry) => entry.record.kind).at(-1)).toBe('record.forgotten');

    expect(history?.versions).toMatchObject([
      { version: 1, status: 'shredded', isRemoved: true },
      { version: 2, status: 'readable', text: 'The cat uses the flap every night' },
    ]);
  },
);

test('it deletes every key of a quoting item whose own forget stopped before its key delete, before record.forgotten', async () => {
  const api = await startTestAPI();
  const forgets = await startTestMemoryForgets(api.context);
  const seeded = await seedQuotedMemoryItems(api.context, forgets.memory);

  await withWriteTransaction(api.context.log.writer, (tx) =>
    writeForgetStart(tx, api.context, { thread: 'conversation', sequence: seeded.sequence }, []),
  );

  // the item's own forget committed its first record and stopped before it deleted any key
  await writeRecords(api.context.log, [
    {
      kind: 'memory.forget_started',
      definitions: { snapshotHash: 'sha256:test' },
      payload: {
        itemID: seeded.quoting.itemID,
        version: seeded.quoting.version,
        evidenceSequences: [seeded.sequence],
      },
    },
  ]);

  await runRecordForgetCleanup(forgets.forgetContext, seeded.sequence);

  const keyRows = await readTestRecordKeyRows(api.writer);
  const entries = await readRecords(api.context.log, { afterSequence: 0 });

  const kinds = entries.map((entry) => entry.record.kind);

  expect(
    keyRows.filter(
      (row) =>
        row.key_id === seeded.quoting.itemID || row.key_id.startsWith(`${seeded.quoting.itemID}/`),
    ),
  ).toStrictEqual([]);

  expect(kinds.slice(-3)).toStrictEqual([
    'memory.forgotten',
    'memory.evidence_purged',
    'record.forgotten',
  ]);
});

test('it deletes every key of a quoting item whose own forget began before the record forget and stopped before its key delete, before record.forgotten', async () => {
  const api = await startTestAPI();
  const forgets = await startTestMemoryForgets(api.context);
  const seeded = await seedQuotedMemoryItems(api.context, forgets.memory);

  // the item's own forget committed its first record and stopped before it deleted any key
  await writeRecords(api.context.log, [
    {
      kind: 'memory.forget_started',
      definitions: { snapshotHash: 'sha256:test' },
      payload: {
        itemID: seeded.quoting.itemID,
        version: seeded.quoting.version,
        evidenceSequences: [seeded.sequence],
      },
    },
  ]);

  await withWriteTransaction(api.context.log.writer, (tx) =>
    writeForgetStart(tx, api.context, { thread: 'conversation', sequence: seeded.sequence }, []),
  );

  await runRecordForgetCleanup(forgets.forgetContext, seeded.sequence);

  const keyRows = await readTestRecordKeyRows(api.writer);
  const entries = await readRecords(api.context.log, { afterSequence: 0 });

  const kinds = entries.map((entry) => entry.record.kind);

  expect(
    keyRows.filter(
      (row) =>
        row.key_id === seeded.quoting.itemID || row.key_id.startsWith(`${seeded.quoting.itemID}/`),
    ),
  ).toStrictEqual([]);

  expect(kinds.slice(-3)).toStrictEqual([
    'memory.forgotten',
    'memory.evidence_purged',
    'record.forgotten',
  ]);
});
