import { expect, test } from 'bun:test';
import { readBudgetLedger } from '@heynixie/budgets';
import { seedBudgetInForce } from '@heynixie/budgets/test-utils';
import invariant from 'tiny-invariant';
import { connectCall } from '../connect/connect-call';
import { hangUpCall } from '../hang-up/hang-up-call';
import { startCall } from '../start/start-call';
import { probeStubbedCaller, startTestCalls } from '../test-utils';
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
    connect: () =>
      connectCall(ctx.context, {
        callID,
        session: 'identity-1',
        sdpOffer: 'offer',
        probeCaller: probeStubbedCaller,
      }),
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

test('it keeps a live call whose speech session this process lost for 30 s, then ends it as dropped', async () => {
  const ctx = await setupTest();

  await ctx.connect();

  ctx.context.sessions.clear();

  await runCallSweep(ctx.context);

  ctx.clock.advance(29_000);

  await runCallSweep(ctx.context);

  const waiting = await readCall(ctx.writer.db, ctx.callID);

  ctx.clock.advance(1000);

  await runCallSweep(ctx.context);

  const ended = await readCall(ctx.writer.db, ctx.callID);

  expect([waiting?.state, ended?.state, ended?.endedBy]).toStrictEqual([
    'live',
    'ended',
    'dropped',
  ]);
});

test('it closes the speech session of a budget end when the budget line fails, and logs the failure', async () => {
  const ctx = await setupTest();

  await seedBudgetInForce(ctx.writer, {
    id: 'call-day',
    counts: 'tool:call',
    limitMicros: 75_000,
    period: 'day',
  });

  await ctx.connect();

  ctx.clock.advance(61_000);

  const failingLine = {
    ...ctx.context,
    speech: { ...ctx.speech, say: () => Promise.reject(new Error('the line was refused')) },
  };

  await runCallSweep(failingLine);

  expect({
    methods: ctx.speech.calls.map((entry) => entry.method),
    logged: ctx.logged,
  }).toStrictEqual({
    methods: ['open', 'close'],
    logged: [
      {
        event: 'calls.session_say_failed',
        fields: { callID: ctx.callID, error: 'the line was refused' },
      },
    ],
  });
});

test('it charges nothing to a call that a hang-up ended, whatever the clock says', async () => {
  const ctx = await setupTest();

  await ctx.connect();

  ctx.clock.advance(121_000);

  await hangUpCall(ctx.context, ctx.callID);

  ctx.clock.advance(300_000);

  await runCallSweep(ctx.context);

  const ledger = await readBudgetLedger(ctx.writer.db, ctx.context.budgets, 'call-day');

  expect(ledger?.charges).toHaveLength(3);
});

test('it reports once a call that ended before its task stopped and ran no closing turn', async () => {
  const ctx = await setupTest();

  const taskID = ctx.createdTasks[0]?.taskID ?? '';

  await ctx.connect();

  await hangUpCall(ctx.context, ctx.callID);

  ctx.endTask(taskID);

  await runCallSweep(ctx.context);
  await runCallSweep(ctx.context);

  expect(ctx.strandedReports).toStrictEqual([ctx.callID]);
});

test('it reports no call that ended more than a day before its task stopped', async () => {
  const ctx = await setupTest();

  const taskID = ctx.createdTasks[0]?.taskID ?? '';

  await ctx.connect();

  await hangUpCall(ctx.context, ctx.callID);

  ctx.clock.advance(24 * 60 * 60 * 1000 + 1);
  ctx.endTask(taskID);

  await runCallSweep(ctx.context);

  expect(ctx.strandedReports).toStrictEqual([]);
});
