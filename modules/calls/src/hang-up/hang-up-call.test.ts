import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { connectCall } from '../connect/connect-call';
import { startCall } from '../start/start-call';
import { startTestCalls } from '../test-utils';
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
