import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { waitFor } from '@zgeoff/testing';
import invariant from 'tiny-invariant';
import { connectCall } from '../connect/connect-call';
import { endAskedCall } from '../hang-up/end-asked-call';
import { markHangUp } from '../hang-up/mark-hang-up';
import { startCall } from '../start/start-call';
import { probeStubbedCaller, startTestCalls } from '../test-utils';
import { readCall } from '../utils/read-call';
import { closeCutHandOffs } from './close-cut-hand-offs';
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

test('it sends a hand-off that a cut turn closed no holding line and no answer', async () => {
  const ctx = await setupTest();

  ctx.speech.emit(ctx.sessionID, {
    kind: 'hand_off',
    handOffID: 'h1',
    request: 'what is on today',
  });

  await waitFor(() => expect(ctx.clock.readNextDueMs()).not.toBeNull());

  closeCutHandOffs(ctx.context, ctx.callID, ['h1']);

  ctx.clock.advance(1500);

  await sendTurnAnswer(ctx.context, {
    callID: ctx.callID,
    taskID: ctx.taskID,
    handOffID: 'h1',
    replies: ['You have two things today.'],
    replyRecordID: '12',
    isFailed: false,
  });

  ctx.speech.emit(ctx.sessionID, { kind: 'heard', text: 'hm', startedAtMs: 0, endedAtMs: 300 });

  await waitFor(async () => {
    const thread = await ctx.readThread();

    expect(thread).toHaveLength(2);
  });

  expect(ctx.speech.calls.filter((call) => call.method !== 'open')).toStrictEqual([]);
});

test('it drops the hang-up that a cut turn asked for', async () => {
  const ctx = await setupTest();

  markHangUp(ctx.context, ctx.callID);
  closeCutHandOffs(ctx.context, ctx.callID, []);

  await endAskedCall(ctx.context, ctx.callID);

  const call = await readCall(ctx.log.writer.db, ctx.callID);

  expect(call?.state).toBe('live');
});
