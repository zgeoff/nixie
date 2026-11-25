import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { connectCall } from '../connect/connect-call';
import { startCall } from '../start/start-call';
import { probeStubbedCaller, startTestCalls } from '../test-utils';
import { readCall } from '../utils/read-call';
import { endAskedCall } from './end-asked-call';
import { markHangUp } from './mark-hang-up';

async function setupTest() {
  const ctx = await startTestCalls();
  const started = await startCall(ctx.context, { carryingSession: 'identity-1' });

  invariant(started.status === 'started', 'the test call starts');

  await connectCall(ctx.context, {
    callID: started.callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  });

  return {
    ...ctx,
    callID: started.callID,
    readCall: () => readCall(ctx.log.writer.db, started.callID),
  };
}

test('it ends the call as nixie once the turn that asked to hang up is done', async () => {
  const ctx = await setupTest();

  markHangUp(ctx.context, ctx.callID);

  await endAskedCall(ctx.context, ctx.callID);

  const call = await ctx.readCall();

  expect({ state: call?.state, endedBy: call?.endedBy }).toStrictEqual({
    state: 'ended',
    endedBy: 'nixie',
  });
});

test('it keeps the call running after a turn that asked no hang-up', async () => {
  const ctx = await setupTest();

  await endAskedCall(ctx.context, ctx.callID);

  const call = await ctx.readCall();

  expect(call?.state).toBe('live');
});
