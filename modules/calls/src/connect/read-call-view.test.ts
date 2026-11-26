import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startCall } from '../start/start-call';
import { buildTestCallsContext, probeStubbedCaller, startTestCalls } from '../test-utils';
import { connectCall } from './connect-call';
import { readCallView } from './read-call-view';

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

  return { ...ctx, callID: started.callID };
}

test('it reads a live call that holds its speech session as one that waits for no offer', async () => {
  const ctx = await setupTest();
  const view = await readCallView(ctx.context, ctx.callID);

  expect(view).toStrictEqual({
    callID: ctx.callID,
    state: 'live',
    endedBy: null,
    reconnect: null,
  });
});

test('it reads a live call that a restarted process holds no session for as one that waits for a restart offer', async () => {
  const ctx = await setupTest();

  const restarted = buildTestCallsContext({ log: ctx.log, clock: ctx.clock });

  const view = await readCallView(restarted.context, ctx.callID);

  expect(view).toStrictEqual({
    callID: ctx.callID,
    state: 'live',
    endedBy: null,
    reconnect: 'restart',
  });
});

test('it reads null for a call that does not exist', async () => {
  const ctx = await startTestCalls();
  const view = await readCallView(ctx.context, 'nothing');

  expect(view).toBeNull();
});
