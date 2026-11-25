import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { readTestProjectionDrift } from '@heynixie/log/test-utils';
import { conversationTaskID } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { connectCall } from '../connect/connect-call';
import { hangUpCall } from '../hang-up/hang-up-call';
import { runCallSweep } from '../meter/run-call-sweep';
import { callAnsweredCodec } from '../record/call-answered-codec';
import { callRangCodec } from '../record/call-rang-codec';
import { callStartedCodec } from '../record/call-started-codec';
import { startCall } from '../start/start-call';
import { probeStubbedCaller, startTestCalls } from '../test-utils';
import { readCall } from '../utils/read-call';

async function setupTest() {
  const ctx = await startTestCalls();
  const started = await startCall(ctx.context, { carryingSession: 'identity-1' });

  invariant(started.status === 'started', 'the test call starts');

  return { ...ctx, callID: started.callID };
}

test('it follows a call from connecting through live to ended', async () => {
  const ctx = await setupTest();
  const connecting = await readCall(ctx.writer.db, ctx.callID);

  await connectCall(ctx.context, {
    callID: ctx.callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  });

  const live = await readCall(ctx.writer.db, ctx.callID);

  ctx.clock.advance(125_000);

  await runCallSweep(ctx.context);
  await hangUpCall(ctx.context, ctx.callID);

  const ended = await readCall(ctx.writer.db, ctx.callID);

  expect([connecting, live, ended].map((call) => [call?.state, call?.minutes])).toStrictEqual([
    ['connecting', 0],
    ['live', 1],
    ['ended', 3],
  ]);
});

test('it counts a minute once although each minute charges 2 budgets', async () => {
  const ctx = await setupTest();

  await connectCall(ctx.context, {
    callID: ctx.callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  });

  const call = await readCall(ctx.writer.db, ctx.callID);

  expect(call?.minutes).toBe(1);
});

test('it gives the same rows after a rebuild from the first record', async () => {
  const ctx = await setupTest();

  await connectCall(ctx.context, {
    callID: ctx.callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  });

  ctx.clock.advance(61_000);

  await runCallSweep(ctx.context);
  await hangUpCall(ctx.context, ctx.callID);

  const drift = await readTestProjectionDrift(ctx.log);

  expect(drift).toStrictEqual([]);
});

test('it follows a ring from ringing through answered to connecting', async () => {
  const ctx = await startTestCalls();

  const definitions = { snapshotHash: 'sha256:aa11' };
  const callID = 'ring-1';

  await writeRecords(ctx.log, [
    {
      kind: callStartedCodec.kind,
      definitions,
      thread: conversationTaskID,
      payload: callStartedCodec.encode({
        callID,
        taskID: 'task-1',
        startedBy: 'nixie',
        carryingSession: 'identity-1',
      }),
    },
    {
      kind: callRangCodec.kind,
      definitions,
      thread: conversationTaskID,
      payload: callRangCodec.encode({ callID, deviceCount: 2 }),
    },
  ]);

  const ringing = await readCall(ctx.writer.db, callID);

  await writeRecords(ctx.log, [
    {
      kind: callAnsweredCodec.kind,
      definitions,
      thread: conversationTaskID,
      payload: callAnsweredCodec.encode({ callID, carryingSession: 'identity-2' }),
    },
  ]);

  const answered = await readCall(ctx.writer.db, callID);

  expect([ringing, answered].map((call) => [call?.state, call?.carryingSession])).toStrictEqual([
    ['ringing', 'identity-1'],
    ['connecting', 'identity-2'],
  ]);
});
