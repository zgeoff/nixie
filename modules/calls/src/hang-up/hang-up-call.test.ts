import { expect, test } from 'bun:test';
import { seedBudgetInForce } from '@heynixie/budgets/test-utils';
import { readRecords } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { connectCall } from '../connect/connect-call';
import { runCallSweep } from '../meter/run-call-sweep';
import { startCall } from '../start/start-call';
import { probeStubbedCaller, startTestCalls } from '../test-utils';
import { readCall } from '../utils/read-call';
import { hangUpCall } from './hang-up-call';

async function setupTest() {
  const ctx = await startTestCalls();
  const started = await startCall(ctx.context, { carryingSession: 'identity-1' });

  invariant(started.status === 'started', 'the test call starts');

  return { ...ctx, callID: started.callID };
}

test('it ends a live call as you, closes its session and keeps its minutes', async () => {
  const ctx = await setupTest();

  await connectCall(ctx.context, {
    callID: ctx.callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  });

  const result = await hangUpCall(ctx.context, ctx.callID);
  const call = await readCall(ctx.writer.db, ctx.callID);

  expect([result, call?.state, call?.endedBy, call?.minutes]).toStrictEqual([
    { status: 'done', state: 'ended' },
    'ended',
    'you',
    1,
  ]);

  expect(ctx.speech.calls.at(-1)).toStrictEqual({ method: 'close', sessionID: 'fake-session-1' });
});

test('it writes the ended record on the conversation thread once, however often it is asked', async () => {
  const ctx = await setupTest();

  await hangUpCall(ctx.context, ctx.callID);
  await hangUpCall(ctx.context, ctx.callID);

  const found = await readRecords(ctx.log, { afterSequence: 0, kinds: ['call.ended'] });

  expect(found.map((entry) => [entry.record.thread, entry.record.payload])).toStrictEqual([
    [conversationTaskID, { callID: ctx.callID, endedBy: 'you', minutes: 0 }],
  ]);
});

test('it refuses an ID that no call has', async () => {
  const ctx = await setupTest();
  const result = await hangUpCall(ctx.context, 'nothing');

  expect(result).toStrictEqual({ status: 'refused', error: 'CALL_NOT_FOUND' });
});

test('it lets a new call start after the running one hangs up', async () => {
  const ctx = await setupTest();

  await hangUpCall(ctx.context, ctx.callID);

  const next = await startCall(ctx.context, { carryingSession: 'identity-1' });

  expect(next.status).toBe('started');
});

test('it charges the minute that has started and no sweep has charged before it ends the call', async () => {
  const ctx = await setupTest();

  await connectCall(ctx.context, {
    callID: ctx.callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  });

  ctx.clock.advance(60_001);

  await hangUpCall(ctx.context, ctx.callID);
  await runCallSweep(ctx.context);

  const call = await readCall(ctx.writer.db, ctx.callID);
  const found = await readRecords(ctx.log, { afterSequence: 0, kinds: ['call.ended'] });

  expect([call?.minutes, found.map((entry) => entry.record.payload)]).toStrictEqual([
    2,
    [{ callID: ctx.callID, endedBy: 'you', minutes: 2 }],
  ]);
});

test('it ends the call as budget when the day budget has no room for the minute that has started', async () => {
  const ctx = await setupTest();

  await seedBudgetInForce(ctx.writer, {
    id: 'call-day',
    counts: 'tool:call',
    limitMicros: 50_000,
    period: 'day',
  });

  await connectCall(ctx.context, {
    callID: ctx.callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  });

  ctx.clock.advance(60_001);

  const result = await hangUpCall(ctx.context, ctx.callID);
  const call = await readCall(ctx.writer.db, ctx.callID);

  expect([result, call?.endedBy, call?.minutes]).toStrictEqual([
    { status: 'done', state: 'ended' },
    'budget',
    1,
  ]);

  expect(ctx.speech.calls.slice(1)).toStrictEqual([
    {
      method: 'say',
      sessionID: 'fake-session-1',
      text: ctx.context.readVoiceDefinitions().lines.budget,
    },
    { method: 'close', sessionID: 'fake-session-1' },
  ]);
});

test('it logs a session that fails to close, and forgets the session', async () => {
  const ctx = await setupTest();

  await connectCall(ctx.context, {
    callID: ctx.callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  });

  const failingClose = {
    ...ctx.context,
    speech: { ...ctx.speech, close: () => Promise.reject(new Error('the close was refused')) },
  };

  await hangUpCall(failingClose, ctx.callID);

  expect({ logged: ctx.logged, sessions: ctx.context.sessions.size }).toStrictEqual({
    logged: [
      {
        event: 'calls.session_close_failed',
        fields: { callID: ctx.callID, error: 'the close was refused' },
      },
    ],
    sessions: 0,
  });
});
