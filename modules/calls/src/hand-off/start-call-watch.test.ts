import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { waitFor } from '@zgeoff/testing';
import invariant from 'tiny-invariant';
import { connectCall } from '../connect/connect-call';
import { readCallView } from '../connect/read-call-view';
import { runCallSweep } from '../meter/run-call-sweep';
import { startCall } from '../start/start-call';
import { probeStubbedCaller, startTestCalls } from '../test-utils';
import { endCall } from '../utils/end-call';
import { readCall } from '../utils/read-call';
import { sendTurnAnswer } from './send-turn-answer';

async function setupTest() {
  const ctx = await startTestCalls();
  const started = await startCall(ctx.context, { carryingSession: 'identity-1' });

  invariant(started.status === 'started', 'the test call starts');

  const taskID = ctx.createdTasks[0]?.taskID;

  invariant(taskID !== undefined, 'the call created its task');

  await connectCall(ctx.context, {
    callID: started.callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  });

  return {
    ...ctx,
    callID: started.callID,
    taskID,
    sessionID: 'fake-session-1',
    readThread: async () => {
      const entries = await readRecords(ctx.log, { afterSequence: 0, thread: taskID });

      return entries.map((entry) => entry.record);
    },
  };
}

test('it records each slice of speech as a dictated owner message on the call thread', async () => {
  const ctx = await setupTest();

  ctx.speech.emit(ctx.sessionID, {
    kind: 'heard',
    text: 'what is on today',
    startedAtMs: 0,
    endedAtMs: 900,
  });

  const records = await waitFor(async () => {
    const thread = await ctx.readThread();

    expect(thread).toHaveLength(1);

    return thread;
  });

  expect(records[0]).toMatchObject({
    kind: 'owner_message',
    payload: { identityID: 'identity-1', isDictated: true },
    erasable: {
      status: 'readable',
      fields: {
        text: 'what is on today',
        spans: [{ start: 0, end: 16, source: 'dictated' }],
      },
    },
  });
});

test('it writes the small talk since the last hand-off, then the hand-off, once each', async () => {
  const ctx = await setupTest();

  ctx.speech.emit(ctx.sessionID, { kind: 'spoke', text: 'Morning!', heardChars: 8 });

  ctx.speech.emit(ctx.sessionID, {
    kind: 'hand_off',
    handOffID: 'h1',
    request: 'what is on today',
  });

  const kinds = await waitFor(async () => {
    const thread = await ctx.readThread();

    expect(thread).toHaveLength(2);

    return thread.map((record) => record.kind);
  });

  ctx.speech.emit(ctx.sessionID, { kind: 'hand_off', handOffID: 'h2', request: 'and tomorrow' });

  const after = await waitFor(async () => {
    const thread = await ctx.readThread();

    expect(thread).toHaveLength(3);

    return thread.map((record) => record.kind);
  });

  expect(kinds).toStrictEqual(['call.spoke', 'call.handed_off']);
  expect(after).toStrictEqual(['call.spoke', 'call.handed_off', 'call.handed_off']);
});

test('it says the holding line when no answer has started by hold_after_ms after a hand-off', async () => {
  const ctx = await setupTest();

  ctx.speech.emit(ctx.sessionID, {
    kind: 'hand_off',
    handOffID: 'h1',
    request: 'what is on today',
  });

  await waitFor(() => {
    expect(ctx.clock.readNextDueMs()).not.toBeNull();
  });

  ctx.clock.advance(1500);

  await waitFor(() => {
    expect(ctx.speech.calls.at(-1)).toStrictEqual({
      method: 'say',
      sessionID: ctx.sessionID,
      text: 'One moment.',
    });
  });
});

test('it says no holding line when the answer started before hold_after_ms', async () => {
  const ctx = await setupTest();

  ctx.speech.emit(ctx.sessionID, {
    kind: 'hand_off',
    handOffID: 'h1',
    request: 'what is on today',
  });

  await waitFor(() => {
    expect(ctx.clock.readNextDueMs()).not.toBeNull();
  });

  await sendTurnAnswer(ctx.context, {
    callID: ctx.callID,
    taskID: ctx.taskID,
    handOffID: 'h1',
    replies: ['You have two things today.'],
    replyRecordID: '12',
    isFailed: false,
  });

  ctx.clock.advance(1500);

  await ctx.readThread();

  expect(ctx.speech.calls.filter((call) => call.method === 'say')).toStrictEqual([]);
});

test('it sends the reply text to the speech layer as one final answer', async () => {
  const ctx = await setupTest();

  ctx.speech.emit(ctx.sessionID, {
    kind: 'hand_off',
    handOffID: 'h1',
    request: 'what is on today',
  });

  await waitFor(async () => {
    const thread = await ctx.readThread();

    expect(thread).toHaveLength(1);
  });

  await sendTurnAnswer(ctx.context, {
    callID: ctx.callID,
    taskID: ctx.taskID,
    handOffID: 'h1',
    replies: ['You have two things today.', 'The first is at nine.'],
    replyRecordID: '12',
    isFailed: false,
  });

  expect(ctx.speech.calls.filter((call) => call.method === 'answer')).toStrictEqual([
    {
      method: 'answer',
      sessionID: ctx.sessionID,
      handOffID: 'h1',
      text: 'You have two things today.\n\nThe first is at nine.',
      final: true,
    },
  ]);
});

test.each([
  ['a turn that failed', ['half an answer'], true],
  ['a turn that wrote no text', [' '], false],
] as const)('it sends the fixed line for %s', async (_name, replies, isFailed) => {
  const ctx = await setupTest();

  ctx.speech.emit(ctx.sessionID, {
    kind: 'hand_off',
    handOffID: 'h1',
    request: 'what is on today',
  });

  await waitFor(async () => {
    const thread = await ctx.readThread();

    expect(thread).toHaveLength(1);
  });

  await sendTurnAnswer(ctx.context, {
    callID: ctx.callID,
    taskID: ctx.taskID,
    handOffID: 'h1',
    replies,
    replyRecordID: null,
    isFailed,
  });

  expect(ctx.speech.calls.at(-1)).toMatchObject({
    method: 'answer',
    text: "I couldn't finish that one.",
  });
});

test('it marks the reply with how much the user heard when they talk over an answered hand-off', async () => {
  const ctx = await setupTest();

  ctx.speech.emit(ctx.sessionID, {
    kind: 'hand_off',
    handOffID: 'h1',
    request: 'what is on today',
  });

  await waitFor(async () => {
    const thread = await ctx.readThread();

    expect(thread).toHaveLength(1);
  });

  await sendTurnAnswer(ctx.context, {
    callID: ctx.callID,
    taskID: ctx.taskID,
    handOffID: 'h1',
    replies: ['You have two things today.'],
    replyRecordID: '12',
    isFailed: false,
  });

  ctx.speech.emit(ctx.sessionID, { kind: 'cut', handOffID: 'h1', heardChars: 9 });

  const cut = await waitFor(async () => {
    const thread = await ctx.readThread();

    expect(thread).toHaveLength(2);

    return thread[1];
  });

  expect(cut?.kind).toBe('call.heard_cut');

  expect(cut?.payload).toStrictEqual({
    callID: ctx.callID,
    handOffID: 'h1',
    replyRecordID: '12',
    heardChars: 9,
  });
});

test('it interrupts the running turn and marks no reply when the user talks over a hand-off with no answer', async () => {
  const ctx = await setupTest();

  ctx.speech.emit(ctx.sessionID, {
    kind: 'hand_off',
    handOffID: 'h1',
    request: 'what is on today',
  });

  await waitFor(async () => {
    const thread = await ctx.readThread();

    expect(thread).toHaveLength(1);
  });

  ctx.speech.emit(ctx.sessionID, { kind: 'cut', handOffID: 'h1', heardChars: 0 });

  await waitFor(() => {
    expect(ctx.interrupted).toStrictEqual([ctx.taskID]);
  });

  const thread = await ctx.readThread();

  expect(thread).toHaveLength(1);
});

test('it says no holding line for a hand-off the user talked over before its answer', async () => {
  const ctx = await setupTest();

  ctx.speech.emit(ctx.sessionID, {
    kind: 'hand_off',
    handOffID: 'h1',
    request: 'what is on today',
  });

  await waitFor(() => {
    expect(ctx.clock.readNextDueMs()).not.toBeNull();
  });

  ctx.speech.emit(ctx.sessionID, { kind: 'cut', handOffID: 'h1', heardChars: 0 });

  await waitFor(() => {
    expect(ctx.interrupted).toStrictEqual([ctx.taskID]);
  });

  ctx.clock.advance(1500);
  ctx.speech.emit(ctx.sessionID, { kind: 'heard', text: 'wait', startedAtMs: 0, endedAtMs: 300 });

  const kinds = await waitFor(async () => {
    const thread = await ctx.readThread();

    expect(thread).toHaveLength(2);

    return thread.map((record) => record.kind);
  });

  expect({ kinds, says: ctx.speech.calls.filter((call) => call.method === 'say') }).toStrictEqual({
    kinds: ['call.handed_off', 'owner_message'],
    says: [],
  });
});

test('it interrupts no turn and marks no reply when the user talks over the fixed line of a hand-off', async () => {
  const ctx = await setupTest();

  ctx.speech.emit(ctx.sessionID, {
    kind: 'hand_off',
    handOffID: 'h1',
    request: 'what is on today',
  });

  await waitFor(async () => {
    const thread = await ctx.readThread();

    expect(thread).toHaveLength(1);
  });

  await sendTurnAnswer(ctx.context, {
    callID: ctx.callID,
    taskID: ctx.taskID,
    handOffID: 'h1',
    replies: ['I have sent it.'],
    replyRecordID: '12',
    isFailed: true,
  });

  ctx.speech.emit(ctx.sessionID, { kind: 'cut', handOffID: 'h1', heardChars: 4 });
  ctx.speech.emit(ctx.sessionID, { kind: 'heard', text: 'okay', startedAtMs: 0, endedAtMs: 300 });

  const kinds = await waitFor(async () => {
    const thread = await ctx.readThread();

    expect(thread).toHaveLength(3);

    return thread.map((record) => record.kind);
  });

  expect({ kinds, interrupted: ctx.interrupted }).toStrictEqual({
    kinds: ['call.handed_off', 'call.spoke', 'owner_message'],
    interrupted: [],
  });
});

test('it asks the call thread for its last turn when the call ends', async () => {
  const ctx = await setupTest();

  await endCall(ctx.context, ctx.callID, 'you');

  const thread = await ctx.readThread();

  expect(thread.map((record) => record.kind)).toStrictEqual(['call.closing']);
});

test('it writes nothing for a speech event after the call ended', async () => {
  const ctx = await setupTest();

  await endCall(ctx.context, ctx.callID, 'you');

  ctx.speech.emit(ctx.sessionID, { kind: 'heard', text: 'hello', startedAtMs: 0, endedAtMs: 100 });

  const thread = await ctx.readThread();

  expect(thread.map((record) => record.kind)).toStrictEqual(['call.closing']);
});

test('it sends one answer for a hand-off when its answer is sent twice', async () => {
  const ctx = await setupTest();

  ctx.speech.emit(ctx.sessionID, {
    kind: 'hand_off',
    handOffID: 'h1',
    request: 'what is on today',
  });

  await waitFor(async () => {
    const thread = await ctx.readThread();

    expect(thread).toHaveLength(1);
  });

  const answer = {
    callID: ctx.callID,
    taskID: ctx.taskID,
    handOffID: 'h1',
    replies: [],
    replyRecordID: null,
    isFailed: true,
  };

  await sendTurnAnswer(ctx.context, answer);

  await sendTurnAnswer(ctx.context, {
    ...answer,
    replies: ['You have two things today.'],
    isFailed: false,
  });

  expect(ctx.speech.calls.filter((call) => call.method === 'answer')).toHaveLength(1);
});

test('it records the holding line as speech layer speech on the call thread', async () => {
  const ctx = await setupTest();

  ctx.speech.emit(ctx.sessionID, {
    kind: 'hand_off',
    handOffID: 'h1',
    request: 'what is on today',
  });

  await waitFor(() => {
    expect(ctx.clock.readNextDueMs()).not.toBeNull();
  });

  ctx.clock.advance(1500);

  await waitFor(async () => {
    const thread = await ctx.readThread();

    expect(thread.map((record) => record.kind)).toStrictEqual(['call.handed_off', 'call.spoke']);
  });

  const thread = await ctx.readThread();

  const spoke = thread.at(-1);

  expect(spoke?.payload).toMatchObject({
    speaker: 'speech_layer',
    model: 'fake-speech-1',
    heardChars: 11,
  });

  expect(spoke?.erasable).toMatchObject({ fields: { text: 'One moment.' } });
});

test('it records the fixed line of a failed turn as speech layer speech on the call thread', async () => {
  const ctx = await setupTest();

  ctx.speech.emit(ctx.sessionID, {
    kind: 'hand_off',
    handOffID: 'h1',
    request: 'what is on today',
  });

  await waitFor(async () => {
    const thread = await ctx.readThread();

    expect(thread).toHaveLength(1);
  });

  await sendTurnAnswer(ctx.context, {
    callID: ctx.callID,
    taskID: ctx.taskID,
    handOffID: 'h1',
    replies: [],
    replyRecordID: null,
    isFailed: true,
  });

  const thread = await ctx.readThread();

  const spoke = thread.at(-1);

  expect(spoke?.kind).toBe('call.spoke');
  expect(spoke?.erasable).toMatchObject({ fields: { text: "I couldn't finish that one." } });
});

test('it waits 30 s for a new offer when the speech session drops, then ends the call as dropped with no more charges', async () => {
  const ctx = await setupTest();

  ctx.speech.emit(ctx.sessionID, { kind: 'dropped' });

  await waitFor(async () => {
    const view = await readCallView(ctx.context, ctx.callID);

    expect(view?.reconnect).toBe('dropped');
  });

  ctx.clock.advance(30_000);

  await runCallSweep(ctx.context);

  const call = await readCall(ctx.writer.db, ctx.callID);

  expect([
    call?.state,
    call?.endedBy,
    call?.minutes,
    ctx.context.sessions.has(ctx.callID),
  ]).toStrictEqual(['ended', 'dropped', 1, false]);
});

test('it sends no answer to the new speech session for a hand-off that the old session made', async () => {
  const ctx = await setupTest();

  ctx.speech.emit(ctx.sessionID, {
    kind: 'hand_off',
    handOffID: 'h1',
    request: 'what is on today',
  });

  await waitFor(async () => {
    const thread = await ctx.readThread();

    expect(thread).toHaveLength(1);
  });

  ctx.speech.emit(ctx.sessionID, { kind: 'dropped' });

  await waitFor(async () => {
    const view = await readCallView(ctx.context, ctx.callID);

    expect(view?.reconnect).toBe('dropped');
  });

  await connectCall(ctx.context, {
    callID: ctx.callID,
    session: 'identity-1',
    sdpOffer: 'offer-2',
    probeCaller: probeStubbedCaller,
  });

  await sendTurnAnswer(ctx.context, {
    callID: ctx.callID,
    taskID: ctx.taskID,
    handOffID: 'h1',
    replies: ['You have two things today.'],
    replyRecordID: '12',
    isFailed: false,
  });

  expect(ctx.speech.calls.filter((call) => call.method === 'answer')).toStrictEqual([]);
});
