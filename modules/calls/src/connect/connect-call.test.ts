import { expect, onTestFinished, test } from 'bun:test';
import { readBudgetLedger } from '@heynixie/budgets';
import { seedBudgetInForce } from '@heynixie/budgets/test-utils';
import { readRecords, subscribeToChanged } from '@heynixie/log';
import { waitFor } from '@zgeoff/testing';
import invariant from 'tiny-invariant';
import { sendTurnAnswer } from '../hand-off/send-turn-answer';
import { hangUpCall } from '../hang-up/hang-up-call';
import { startCall } from '../start/start-call';
import { buildTestCallsContext, probeStubbedCaller, startTestCalls } from '../test-utils';
import { readCall } from '../utils/read-call';
import { connectCall } from './connect-call';
import { readCallView } from './read-call-view';

async function setupTest() {
  const ctx = await startTestCalls();

  return {
    ...ctx,

    // Starts to listen as a device does, and settles when the calls topic next changes.
    listenForCallsChange: () => {
      const changed = Promise.withResolvers<void>();

      const stop = subscribeToChanged(ctx.writer, (topics) => {
        if (topics.includes('calls')) {
          changed.resolve();
        }
      });

      onTestFinished(stop);

      return changed.promise;
    },
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
    probeCaller: probeStubbedCaller,
  });

  expect(result).toStrictEqual({ status: 'connected', sdpAnswer: 'fake-answer-1' });

  expect(ctx.speech.calls).toStrictEqual([
    {
      method: 'open',
      sessionID: 'fake-session-1',
      input: {
        sdpOffer: 'offer',
        instructions: 'the voice-call prompt',
        voice: 'marin',
      },
    },
  ]);
});

test('it charges the first minute against both call budgets with the call_minute purpose', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  await connectCall(ctx.context, {
    callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  });

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

  await connectCall(ctx.context, {
    callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  });

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
    probeCaller: probeStubbedCaller,
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
    probeCaller: probeStubbedCaller,
  });

  expect(result).toStrictEqual({ status: 'refused', error: 'NOT_CARRYING_SESSION' });
  expect(ctx.speech.calls).toStrictEqual([]);
});

test('it refuses a connect of a call that is already live', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  await connectCall(ctx.context, {
    callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  });

  const result = await connectCall(ctx.context, {
    callID,
    session: 'identity-1',
    sdpOffer: 'again',
    probeCaller: probeStubbedCaller,
  });

  expect(result).toStrictEqual({ status: 'refused', error: 'CALL_CONNECTED' });
});

test('it refuses a connect when the server wires no speech layer', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  const noSpeech = { ...ctx.context, speech: null };

  const result = await connectCall(noSpeech, {
    callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  });

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
    probeCaller: probeStubbedCaller,
  });

  const call = await readCall(ctx.writer.db, callID);

  expect([result, call?.state, call?.endedBy, call?.minutes]).toStrictEqual([
    { status: 'refused', error: 'VOICE_CREDENTIAL_REFUSED' },
    'ended',
    'dropped',
    0,
  ]);

  expect(ctx.speech.calls).toStrictEqual([
    {
      method: 'open',
      sessionID: null,
      input: { sdpOffer: 'offer', instructions: 'the voice-call prompt', voice: 'marin' },
    },
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
    probeCaller: probeStubbedCaller,
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

test('it opens one speech session when 2 connects of one call overlap', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  const connect = () =>
    connectCall(ctx.context, {
      callID,
      session: 'identity-1',
      sdpOffer: 'offer',
      probeCaller: probeStubbedCaller,
    });

  const results = await Promise.all([connect(), connect()]);

  expect(results.map((result) => result.status).toSorted()).toStrictEqual(['connected', 'refused']);
  expect(ctx.speech.calls.filter((call) => call.method === 'open')).toHaveLength(1);
});

test('it refuses a connect of a call that a hang-up ended while the provider opened, and closes the session', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  const hangingUp = {
    ...ctx.context,
    speech: {
      ...ctx.speech,
      open: async (input: Parameters<typeof ctx.speech.open>[0]) => {
        await hangUpCall(ctx.context, callID);

        return ctx.speech.open(input);
      },
    },
  };

  const result = await connectCall(hangingUp, {
    callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  });

  const call = await readCall(ctx.writer.db, callID);

  expect([result, call?.state, call?.endedBy, call?.minutes]).toStrictEqual([
    { status: 'refused', error: 'CALL_NOT_FOUND' },
    'ended',
    'you',
    0,
  ]);

  expect(ctx.speech.calls.map((entry) => entry.method)).toStrictEqual(['open', 'close']);
});

test('it closes the speech session when the charge transaction throws', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  const noDefinitions = {
    ...ctx.context,
    budgets: { ...ctx.context.budgets, definitions: () => ({ snapshotHash: '' }) },
  };

  const connecting = connectCall(noDefinitions, {
    callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  });

  await Promise.allSettled([connecting]);

  expect(connecting).rejects.toMatchObject({ name: 'MissingDefinitionsError' });

  expect({
    methods: ctx.speech.calls.map((entry) => entry.method),
    sessions: ctx.context.sessions.size,
    openings: ctx.context.openings.size,
  }).toStrictEqual({ methods: ['open', 'close'], sessions: 0, openings: 0 });
});

test('it opens no speech session for a session that is no longer live', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  const result = await connectCall(ctx.context, {
    callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: () => Promise.resolve(false),
  });

  expect(result).toStrictEqual({ status: 'refused', error: 'SESSION_REVOKED' });
  expect(ctx.speech.calls).toStrictEqual([]);
});

test('it opens no speech session when the session is revoked while the instructions are read', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  const state = { isLive: true };

  const result = await connectCall(
    {
      ...ctx.context,
      readInstructions: () => {
        state.isLive = false;

        return Promise.resolve('the voice-call prompt');
      },
    },
    {
      callID,
      session: 'identity-1',
      sdpOffer: 'offer',
      probeCaller: () => Promise.resolve(state.isLive),
    },
  );

  const call = await readCall(ctx.writer.db, callID);

  expect([result, call?.minutes, ctx.speech.calls]).toStrictEqual([
    { status: 'refused', error: 'SESSION_REVOKED' },
    0,
    [],
  ]);
});

test('it closes the speech session when the session is revoked while the provider opens', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  const answers = [true, false];

  const result = await connectCall(ctx.context, {
    callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: () => Promise.resolve(answers.shift() ?? false),
  });

  const call = await readCall(ctx.writer.db, callID);

  expect([result, call?.state, call?.minutes]).toStrictEqual([
    { status: 'refused', error: 'SESSION_REVOKED' },
    'connecting',
    0,
  ]);

  expect(ctx.speech.calls.map((entry) => entry.method)).toStrictEqual(['open', 'close']);
});

test('it moves a live call to a new session on a new offer after the speech session dropped, and charges nothing again', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  const request = {
    callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  };

  await connectCall(ctx.context, request);

  const signal = ctx.listenForCallsChange();

  ctx.speech.emit('fake-session-1', { kind: 'dropped' });

  // the device reads the call on the signal, and sends its new offer only to a call that waits
  const waiting = await signal.then(() => readCallView(ctx.context, callID));

  expect(waiting?.reconnect).toBe('dropped');

  const result = await connectCall(ctx.context, { ...request, sdpOffer: 'offer-2' });
  const ledger = await readBudgetLedger(ctx.writer.db, ctx.context.budgets, 'call-day');
  const view = await readCallView(ctx.context, callID);

  expect({
    result,
    methods: ctx.speech.calls.map((entry) => entry.method),
    charges: ledger?.charges.length,
    reconnect: view?.reconnect,
  }).toStrictEqual({
    result: { status: 'connected', sdpAnswer: 'fake-answer-2' },
    methods: ['open', 'open', 'say'],
    charges: 1,
    reconnect: null,
  });
});

test('it takes a new offer for a live call that this process holds no session for, as after a restart', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  const request = {
    callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  };

  await connectCall(ctx.context, request);

  const restarted = buildTestCallsContext({ log: ctx.log, clock: ctx.clock });

  const result = await connectCall(restarted.context, request);
  const records = await readRecords(ctx.log, { afterSequence: 0 });

  expect({
    status: result.status,
    reconnected: records
      .map((entry) => entry.record)
      .filter((record) => record.kind === 'call.reconnected')
      .map((record) => record.payload),
  }).toStrictEqual({ status: 'connected', reconnected: [{ callID, cause: 'restart' }] });
});

test('it closes the old session once a session that is near its limit gets its new one', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  const request = {
    callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  };

  await connectCall(ctx.context, request);

  const signal = ctx.listenForCallsChange();

  ctx.speech.emit('fake-session-1', { kind: 'session_ending' });

  await signal;

  const waiting = await readCallView(ctx.context, callID);

  expect(waiting?.reconnect).toBe('session_limit');

  await connectCall(ctx.context, request);

  expect(
    ctx.speech.calls.map(
      (entry) => `${entry.method}:${entry.method === 'open' ? entry.sessionID : entry.sessionID}`,
    ),
  ).toStrictEqual([
    'open:fake-session-1',
    'open:fake-session-2',
    'close:fake-session-1',
    'say:fake-session-2',
  ]);
});

test('it refuses a new offer for a live call that holds its session and waits for none', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  const request = {
    callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  };

  await connectCall(ctx.context, request);

  const result = await connectCall(ctx.context, request);

  expect(result).toStrictEqual({ status: 'refused', error: 'CALL_CONNECTED' });
});

test('it sends no answer to the new session for a turn of the old session that ends while the sessions swap', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  const taskID = ctx.createdTasks[0]?.taskID;

  invariant(taskID !== undefined, 'the call created its task');

  const request = {
    callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  };

  await connectCall(ctx.context, request);

  ctx.speech.emit('fake-session-1', { kind: 'hand_off', handOffID: 'h1', request: 'what is on' });

  await waitFor(async () => {
    const thread = await readRecords(ctx.log, { afterSequence: 0, thread: taskID });

    expect(thread).toHaveLength(1);
  });

  ctx.speech.emit('fake-session-1', { kind: 'session_ending' });

  await waitFor(async () => {
    const waiting = await readCallView(ctx.context, callID);

    expect(waiting?.reconnect).toBe('session_limit');
  });

  const answering: Promise<void>[] = [];

  // the record write of the swap reads the definitions after the new session is installed
  const reconnected = await connectCall(
    {
      ...ctx.context,
      definitions: () => {
        answering.push(
          sendTurnAnswer(ctx.context, {
            callID,
            taskID,
            handOffID: 'h1',
            replies: ['You have two things today.'],
            replyRecordID: '12',
            isFailed: false,
          }),
        );

        return ctx.context.definitions();
      },
    },
    request,
  );

  await Promise.all(answering);

  expect({
    status: reconnected.status,
    answers: ctx.speech.calls.filter((entry) => entry.method === 'answer'),
    dropped: ctx.logged
      .map((entry) => entry.event)
      .filter((event) => event === 'calls.answer_dropped'),
  }).toStrictEqual({ status: 'connected', answers: [], dropped: ['calls.answer_dropped'] });
});

test('it sends no answer for a turn that ends after a restart, which no hand-off of this process holds', async () => {
  const ctx = await setupTest();
  const callID = await ctx.startRingingCall();

  const taskID = ctx.createdTasks[0]?.taskID;

  invariant(taskID !== undefined, 'the call created its task');

  const request = {
    callID,
    session: 'identity-1',
    sdpOffer: 'offer',
    probeCaller: probeStubbedCaller,
  };

  await connectCall(ctx.context, request);

  const restarted = buildTestCallsContext({ log: ctx.log, clock: ctx.clock });

  await connectCall(restarted.context, request);

  await sendTurnAnswer(restarted.context, {
    callID,
    taskID,
    handOffID: 'h1',
    replies: ['You have two things today.'],
    replyRecordID: '12',
    isFailed: false,
  });

  expect({
    answers: restarted.speech.calls.filter((entry) => entry.method === 'answer'),
    logged: restarted.logged.map((entry) => entry.event),
  }).toStrictEqual({ answers: [], logged: ['calls.answer_dropped'] });
});
