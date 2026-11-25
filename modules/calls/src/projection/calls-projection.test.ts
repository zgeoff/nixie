import { expect, test } from 'bun:test';
import { readTestProjectionDrift } from '@heynixie/log/test-utils';
import invariant from 'tiny-invariant';
import { connectCall } from '../connect/connect-call';
import { hangUpCall } from '../hang-up/hang-up-call';
import { runCallSweep } from '../meter/run-call-sweep';
import { startCall } from '../start/start-call';
import { startTestCalls } from '../test-utils';
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

  await connectCall(ctx.context, { callID: ctx.callID, session: 'identity-1', sdpOffer: 'offer' });

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

  await connectCall(ctx.context, { callID: ctx.callID, session: 'identity-1', sdpOffer: 'offer' });

  const call = await readCall(ctx.writer.db, ctx.callID);

  expect(call?.minutes).toBe(1);
});

test('it gives the same rows after a rebuild from the first record', async () => {
  const ctx = await setupTest();

  await connectCall(ctx.context, { callID: ctx.callID, session: 'identity-1', sdpOffer: 'offer' });

  ctx.clock.advance(61_000);

  await runCallSweep(ctx.context);
  await hangUpCall(ctx.context, ctx.callID);

  const drift = await readTestProjectionDrift(ctx.log);

  expect(drift).toStrictEqual([]);
});
