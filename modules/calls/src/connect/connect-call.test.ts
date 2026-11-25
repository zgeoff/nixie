import { expect, test } from 'bun:test';
import { readBudgetLedger } from '@heynixie/budgets';
import { seedBudgetInForce } from '@heynixie/budgets/test-utils';
import invariant from 'tiny-invariant';
import { startCall } from '../start/start-call';
import { startTestCalls } from '../test-utils';
import { readCall } from '../utils/read-call';
import { connectCall } from './connect-call';

async function setupTest() {
  const ctx = await startTestCalls();

  return {
    ...ctx,
    startRingingCall: async () => {
      const started = await startCall(ctx.context, { carryingSession: 'identity-1' });

      invariant(started.status === 'started', 'the test call starts');

      return started.callID;
    },
  };
}

test('it opens the speech session from the offer and the voice definitions', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  const result = await connectCall(ctx.context, {
    callID,
    session: 'identity-1',
    sdpOffer: 'offer',
  });

  expect(result).toStrictEqual({ status: 'connected', sdpAnswer: 'fake-answer-1' });

  expect(ctx.speech.calls).toStrictEqual([
    {
      method: 'open',
      sessionID: 'fake-session-1',
      input: { sdpOffer: 'offer', instructions: 'the voice-call prompt', voice: 'marin' },
    },
  ]);
});

test('it charges the first minute against both call budgets with the call_minute purpose', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  await connectCall(ctx.context, { callID, session: 'identity-1', sdpOffer: 'offer' });

  const day = await readBudgetLedger(ctx.writer.db, ctx.context.budgets, 'call-day');
  const month = await readBudgetLedger(ctx.writer.db, ctx.context.budgets, 'call-month');

  const charges = [day, month].map((ledger) => ledger?.charges);

  expect(charges).toStrictEqual([
    [
      {
        chargeID: expect.any(String),
        amountMicros: 50_000,
        for: { kind: 'call_minute', id: callID },
        isCredited: false,
      },
    ],
    [
      {
        chargeID: expect.any(String),
        amountMicros: 50_000,
        for: { kind: 'call_minute', id: callID },
        isCredited: false,
      },
    ],
  ]);
});

test('it moves the connected call to live with its first minute counted', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  await connectCall(ctx.context, { callID, session: 'identity-1', sdpOffer: 'offer' });

  const call = await readCall(ctx.writer.db, callID);

  expect([call?.state, call?.minutes, call?.connectedAtMs]).toStrictEqual([
    'live',
    1,
    ctx.clock.now(),
  ]);
});

test('it refuses an ID that no call has', async () => {
  const ctx = await setupTest();

  const result = await connectCall(ctx.context, {
    callID: 'nothing',
    session: 'identity-1',
    sdpOffer: 'offer',
  });

  expect(result).toStrictEqual({ status: 'refused', error: 'CALL_NOT_FOUND' });
});

test('it refuses a session that does not carry the call, and opens no speech session', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  const result = await connectCall(ctx.context, {
    callID,
    session: 'identity-2',
    sdpOffer: 'offer',
  });

  expect(result).toStrictEqual({ status: 'refused', error: 'NOT_CARRYING_SESSION' });
  expect(ctx.speech.calls).toStrictEqual([]);
});

test('it refuses a connect of a call that is already live', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  await connectCall(ctx.context, { callID, session: 'identity-1', sdpOffer: 'offer' });

  const result = await connectCall(ctx.context, {
    callID,
    session: 'identity-1',
    sdpOffer: 'again',
  });

  expect(result).toStrictEqual({ status: 'refused', error: 'CALL_CONNECTED' });
});

test('it refuses a connect when the server wires no speech layer', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  const noSpeech = { ...ctx.context, speech: null };

  const result = await connectCall(noSpeech, { callID, session: 'identity-1', sdpOffer: 'offer' });

  expect(result).toStrictEqual({ status: 'refused', error: 'SPEECH_UNAVAILABLE' });
});

test('it ends the call as dropped when the provider refuses the credential', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  ctx.speech.refuseNextOpen('VOICE_CREDENTIAL_REFUSED');

  const result = await connectCall(ctx.context, {
    callID,
    session: 'identity-1',
    sdpOffer: 'offer',
  });

  const call = await readCall(ctx.writer.db, callID);

  expect([result, call?.state, call?.endedBy, call?.minutes]).toStrictEqual([
    { status: 'refused', error: 'VOICE_CREDENTIAL_REFUSED' },
    'ended',
    'dropped',
    0,
  ]);
});

test('it ends the call as budget when the first minute has no room, after the budget line', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  await seedBudgetInForce(ctx.writer, {
    id: 'call-day',
    counts: 'tool:call',
    limitMicros: 40_000,
    period: 'day',
  });

  const result = await connectCall(ctx.context, {
    callID,
    session: 'identity-1',
    sdpOffer: 'offer',
  });

  const call = await readCall(ctx.writer.db, callID);

  expect([result, call?.endedBy, call?.minutes]).toStrictEqual([
    { status: 'refused', error: 'CALL_BUDGET_REACHED' },
    'budget',
    0,
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
