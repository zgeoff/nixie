import { expect, test } from 'bun:test';
import { readBudgetLedger } from '@heynixie/budgets';
import { seedBudgetInForce } from '@heynixie/budgets/test-utils';
import invariant from 'tiny-invariant';
import { connectCall } from '../connect/connect-call';
import { startCall } from '../start/start-call';
import { startTestCalls } from '../test-utils';
import { readCall } from '../utils/read-call';
import { runCallSweep } from './run-call-sweep';

async function setupTest() {
  const ctx = await startTestCalls();
  const started = await startCall(ctx.context, { carryingSession: 'identity-1' });

  invariant(started.status === 'started', 'the test call starts');

  const callID = started.callID;

  return {
    ...ctx,
    callID,
    connect: () => connectCall(ctx.context, { callID, session: 'identity-1', sdpOffer: 'offer' }),
  };
}

test('it charges each started minute of a live call once', async () => {
  const ctx = await setupTest();

  await ctx.connect();

  ctx.clock.advance(61_000);

  await runCallSweep(ctx.context);
  await runCallSweep(ctx.context);

  const call = await readCall(ctx.writer.db, ctx.callID);

  expect([call?.state, call?.minutes]).toStrictEqual(['live', 2]);
});

test('it ends a call as budget when call-day has no room for its next minute', async () => {
  const ctx = await setupTest();

  await seedBudgetInForce(ctx.writer, {
    id: 'call-day',
    counts: 'tool:call',
    limitMicros: 75_000,
    period: 'day',
  });

  await ctx.connect();

  ctx.clock.advance(61_000);

  await runCallSweep(ctx.context);

  const call = await readCall(ctx.writer.db, ctx.callID);
  const ledger = await readBudgetLedger(ctx.writer.db, ctx.context.budgets, 'call-day');

  expect([call?.state, call?.endedBy, call?.minutes]).toStrictEqual(['ended', 'budget', 1]);

  expect(ledger?.charges.map((charge) => charge.for)).toStrictEqual([
    { kind: 'call_minute', id: ctx.callID },
  ]);
});

test('it says the budget line, then closes the session, of a call that the budget ends', async () => {
  const ctx = await setupTest();

  await seedBudgetInForce(ctx.writer, {
    id: 'call-day',
    counts: 'tool:call',
    limitMicros: 75_000,
    period: 'day',
  });

  await ctx.connect();

  ctx.clock.advance(61_000);

  await runCallSweep(ctx.context);

  expect(ctx.speech.calls.slice(1)).toStrictEqual([
    {
      method: 'say',
      sessionID: 'fake-session-1',
      text: ctx.context.readVoiceDefinitions().lines.budget,
    },
    { method: 'close', sessionID: 'fake-session-1' },
  ]);
});

test('it ends a call that stays connecting for 30 s as dropped', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(30_000);

  await runCallSweep(ctx.context);

  const call = await readCall(ctx.writer.db, ctx.callID);

  expect([call?.state, call?.endedBy]).toStrictEqual(['ended', 'dropped']);
});

test('it leaves a call that connects within 30 s alone', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(20_000);

  await ctx.connect();

  ctx.clock.advance(20_000);

  await runCallSweep(ctx.context);

  const call = await readCall(ctx.writer.db, ctx.callID);

  expect([call?.state, call?.minutes]).toStrictEqual(['live', 1]);
});

test('it ends a live call whose speech session this process lost as dropped', async () => {
  const ctx = await setupTest();

  await ctx.connect();

  ctx.context.sessions.clear();

  await runCallSweep(ctx.context);

  const call = await readCall(ctx.writer.db, ctx.callID);

  expect([call?.state, call?.endedBy]).toStrictEqual(['ended', 'dropped']);
});
