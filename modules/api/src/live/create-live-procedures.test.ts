import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { claimTask, createConversationTask, createTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildSeeder } from '../test-utils/build-seeder';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { readRecordEvents } from '../test-utils/read-record-events';
import { startTestAPI } from '../test-utils/start-test-api';

async function setupTest() {
  const api = await startTestAPI();

  return { ...api, seed: buildSeeder(api) };
}

test('#live.follow streams the records of the thread after the sequence asked for', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const sendText = (clientMessageId: string, text: string) =>
    laptopClient.conversation.send({
      clientMessageId,
      thread: 'conversation',
      text,
      spans: [{ start: 0, end: text.length, source: 'typed' }],
    });

  await sendText('00000000-0000-4000-8000-000000000001', 'one').then(() =>
    sendText('00000000-0000-4000-8000-000000000002', 'two'),
  );

  const connection = await laptopClient.live.follow({
    afterSequence: 0,
    thread: 'conversation',
  });

  const seen = await readRecordEvents(connection, 3);

  expect(seen.map((event) => event.record.message?.text)).toStrictEqual([undefined, 'one', 'two']);
});

test('#live.follow streams a forgotten message as removed', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const sent = await laptopClient.conversation.send({
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f61',
    thread: 'conversation',
    text: 'The shed code is 5521.',
    spans: [],
  });

  await laptopClient.conversation.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a86',
    sequence: sent.sequence,
    thread: 'conversation',
  });

  const connection = await laptopClient.live.follow({
    afterSequence: sent.sequence - 1,
    thread: 'conversation',
  });

  const [message] = await readRecordEvents(connection, 1);

  expect(message?.record.isRemoved).toBeTrue();
  expect(message?.record.message).toBeUndefined();
});

test('#live.follow streams a failed tool result as cancelled when a stop cancelled its action', async () => {
  const ctx = await setupTest();
  const step = await ctx.seed.conversationStep();
  const action = await ctx.seed.action({ step: step.claim });
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  await laptopClient.tasks.stop({
    clientActionID: '4e6a8c0d-2f4b-4d6e-8a9c-0b1d2e3f4a5b',
    taskID: 'conversation',
  });

  const [result] = await writeRecords(ctx.context.log, [
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        callID: 'call-1',
        runID: 'conversation',
        toolUseID: null,
        outcome: 'failed',
        actionID: action.action_id,
        sources: {},
      },
    },
  ]);

  invariant(result);

  const connection = await laptopClient.live.follow({
    afterSequence: result.sequence - 1,
    thread: 'conversation',
  });

  const seen = await readRecordEvents(connection, 1);

  expect(seen.map((event) => event.record.toolCall)).toStrictEqual([
    { callID: 'call-1', outcome: 'cancelled', runID: 'conversation' },
  ]);
});

test('#live.follow cuts a long payload string only when the client asks for clipping', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const [called] = await writeRecords(ctx.context.log, [
    {
      kind: 'tool_called',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        callID: 'call-1',
        runID: 'conversation',
        toolUseID: null,
        tool: 'web.fetch',
        model: 'test-model',
        profile: 'test',
      },
      erasable: { input: { note: 'n'.repeat(9000) } },
    },
  ]);

  invariant(called);

  const connection = await laptopClient.live.follow({
    afterSequence: called.sequence - 1,
    clipPayloads: true,
    thread: 'conversation',
  });

  const seen = await readRecordEvents(connection, 1);

  expect(seen.map((event) => event.record.clipped)).toStrictEqual([
    [{ field: 'toolCall.input', path: ['note'], bytes: 9000 }],
  ]);
});

test('#live.follow resumes from the last event ID with exactly the records it missed', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const sendText = (clientMessageId: string, text: string) =>
    laptopClient.conversation.send({
      clientMessageId,
      thread: 'conversation',
      text,
      spans: [{ start: 0, end: text.length, source: 'typed' }],
    });

  const firstConnection = await sendText('00000000-0000-4000-8000-000000000001', 'one')
    .then(() => sendText('00000000-0000-4000-8000-000000000002', 'two'))
    .then(() => laptopClient.live.follow({ afterSequence: 0, thread: 'conversation' }));

  const seen = await readRecordEvents(firstConnection, 3);

  await firstConnection
    .return(undefined)
    .then(() => sendText('00000000-0000-4000-8000-000000000003', 'three'))
    .then(() => sendText('00000000-0000-4000-8000-000000000004', 'four'));

  const secondConnection = await laptopClient.live.follow(
    { afterSequence: 0, thread: 'conversation' },
    { lastEventId: String(seen.at(-1)?.record.sequence) },
  );

  const missed = await readRecordEvents(secondConnection, 2);

  expect(missed.map((event) => event.record.message?.text)).toStrictEqual(['three', 'four']);
});

test('#live.follow resumes a task thread mid-step with exactly the records it missed', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const taskID = await createTask(ctx.context, 'Plan the beds.', 'k3x9m2p7qa');
  const step = await claimTask(ctx.context, { holder: 'step-runner', leaseMs: 60_000 });

  invariant(step);

  const firstConnection = await laptopClient.live.follow({ afterSequence: 0, thread: taskID });
  const seen = await readRecordEvents(firstConnection, 2);

  await firstConnection
    .return(undefined)
    .then(() =>
      laptopClient.conversation.send({
        clientMessageId: '00000000-0000-4000-8000-000000000001',
        thread: taskID,
        text: 'Put the beans in the north bed.',
        spans: [{ start: 0, end: 31, source: 'typed' }],
      }),
    )
    .then(() =>
      laptopClient.conversation.send({
        clientMessageId: '00000000-0000-4000-8000-000000000002',
        thread: 'conversation',
        text: 'What is on today?',
        spans: [{ start: 0, end: 17, source: 'typed' }],
      }),
    )
    .then(() =>
      laptopClient.tasks.pause({ clientActionID: '2c4e6a8b-1d3f-4b5c-8e7a-9f0b1c2d3e4f', taskID }),
    );

  const secondConnection = await laptopClient.live.follow(
    { afterSequence: 0, thread: taskID },
    { lastEventId: String(seen.at(-1)?.record.sequence) },
  );

  const missed = await readRecordEvents(secondConnection, 2);

  expect(seen.map((event) => event.record.kind)).toStrictEqual([
    'task.created',
    'task.step_started',
  ]);

  expect(
    missed.map((event) => ({ kind: event.record.kind, text: event.record.message?.text })),
  ).toStrictEqual([
    { kind: 'owner_message', text: 'Put the beans in the north bed.' },
    { kind: 'task.pause_requested', text: undefined },
  ]);
});

test('#live.follow streams a stop with the actions it cancelled', async () => {
  const ctx = await setupTest();
  const step = await ctx.seed.conversationStep();
  const action = await ctx.seed.action({ step: step.claim });
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const stopped = await laptopClient.tasks.stop({
    clientActionID: '4e6a8c0d-2f4b-4d6e-8a9c-0b1d2e3f4a5b',
    taskID: 'conversation',
  });

  const [stopRead] = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['task.stopped'],
  });

  invariant(stopRead);

  const stop = stopRead.record;

  const connection = await laptopClient.live.follow({
    afterSequence: stop.sequence - 1,
    thread: 'conversation',
  });

  const seen = await readRecordEvents(connection, 1);

  expect(stopped.state).toBe('stopped');

  expect(seen.map((event) => event.record.stop)).toStrictEqual([
    {
      cancelledActions: [{ actionID: action.action_id, tool: 'test.send' }],
    },
  ]);
});

test('#live.follow ends with UNAUTHORIZED once the session is revoked', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const stream = await laptopClient.live.follow({ afterSequence: 0, thread: 'conversation' });

  const reading = readRecordEvents(stream, Number.POSITIVE_INFINITY);

  await laptopClient.sessions.revoke({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: laptop.sessionID,
  });

  const [settled] = await Promise.allSettled([reading]);

  expect(settled).toMatchObject({ status: 'rejected', reason: { code: 'UNAUTHORIZED' } });
});

test('#live.follow started past the head still ends once the session is revoked', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const stream = await laptopClient.live.follow({
    afterSequence: 1_000_000,
    thread: 'conversation',
  });

  const reading = readRecordEvents(stream, Number.POSITIVE_INFINITY);

  await laptopClient.sessions.revoke({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: laptop.sessionID,
  });

  const [settled] = await Promise.allSettled([reading]);

  expect(settled).toMatchObject({ status: 'rejected', reason: { code: 'UNAUTHORIZED' } });
});

test('#live.follow refuses a revoked session before the stream opens', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  await laptopClient.sessions.revoke({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: laptop.sessionID,
  });

  expect(
    laptopClient.live.follow({ afterSequence: 0, thread: 'conversation' }),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#live.follow sends opened first, once it listens for commits', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const stream = await laptopClient.live.follow({ thread: 'conversation' });
  const first = await stream.next();

  await stream.return(undefined);

  expect(first.value).toStrictEqual({ kind: 'opened' });
});

test('#live.follow sends no record for a page with no thread, and names what changed', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const stream = await laptopClient.live.follow({});

  await stream.next();

  await laptopClient.conversation.send({
    clientMessageId: '00000000-0000-4000-8000-000000000001',
    thread: 'conversation',
    text: 'one',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  const changed = await stream.next();

  await stream.return(undefined);

  expect(changed.value).toStrictEqual({ kind: 'changed', topics: ['tasks'] });
});

test('#live.follow sends only the records of its thread, in sequence order', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const taskID = await createTask(ctx.context, 'Plan the beds.', 'k3x9m2p7qa');

  const send = (clientMessageId: string, thread: string, text: string) =>
    laptopClient.conversation.send({
      clientMessageId,
      thread,
      text,
      spans: [{ start: 0, end: text.length, source: 'typed' }],
    });

  await send('00000000-0000-4000-8000-000000000001', 'conversation', 'one');
  await send('00000000-0000-4000-8000-000000000002', taskID, 'beans');
  await send('00000000-0000-4000-8000-000000000003', 'conversation', 'two');

  const stream = await laptopClient.live.follow({ afterSequence: 0, thread: 'conversation' });
  const seen = await readRecordEvents(stream, 3);

  await stream.return(undefined);

  expect(seen.map((event) => event.record.message?.text)).toStrictEqual([undefined, 'one', 'two']);
});

test('#live.follow starts at the head when it is given no afterSequence', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const send = (clientMessageId: string, text: string) =>
    laptopClient.conversation.send({
      clientMessageId,
      thread: 'conversation',
      text,
      spans: [{ start: 0, end: text.length, source: 'typed' }],
    });

  await send('00000000-0000-4000-8000-000000000001', 'before');

  const stream = await laptopClient.live.follow({ thread: 'conversation' });

  await stream.next();

  await send('00000000-0000-4000-8000-000000000002', 'after');

  const [seen] = await readRecordEvents(stream, 1);

  await stream.return(undefined);

  expect(seen?.record.message?.text).toBe('after');
});

test('#live.follow ends a page with no thread with UNAUTHORIZED once the session is revoked', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const stream = await laptopClient.live.follow({});

  const reading = readRecordEvents(stream, Number.POSITIVE_INFINITY);

  await laptopClient.sessions.revoke({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: laptop.sessionID,
  });

  const [settled] = await Promise.allSettled([reading]);

  expect(settled).toMatchObject({ status: 'rejected', reason: { code: 'UNAUTHORIZED' } });
});

test('#sessions.shown holds the session present, and a stream alone does not', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  const stream = await laptopClient.live.follow({});

  await stream.next();

  const beforeBeat = ctx.context.clients.presence.isPresent(120_000);

  await laptopClient.sessions.shown({});
  await stream.return(undefined);

  expect([beforeBeat, ctx.context.clients.presence.isPresent(120_000)]).toStrictEqual([
    false,
    true,
  ]);
});

test('#sessions.shown lapses from presence once its window passed', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  await laptopClient.sessions.shown({});

  ctx.clock.advance(120_001);

  expect(ctx.context.clients.presence.isPresent(120_000)).toBeFalse();
});
