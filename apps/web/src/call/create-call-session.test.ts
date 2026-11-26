import { expect, test } from 'bun:test';
import type { ContractClient } from '@heynixie/contract';
import { waitFor } from '@zgeoff/testing';
import { buildStubCallEnvironment } from '../test-utils/build-stub-call-environment';
import { buildStubTimer } from '../test-utils/build-stub-timer';
import { createCallSession } from './create-call-session';

interface Calls {
  readonly started: number;
  readonly connects: string[];
  readonly hangUps: string[];
}

interface SetupOptions {
  readonly microphoneError?: Error;

  // the error each connect fails with, in order; null is a connect that works
  readonly connectErrors?: (string | null)[];

  // the answer to one connect, held until the test settles it
  readonly heldConnect?: { readonly call: number; readonly result: Promise<{ sdpAnswer: string }> };

  // the answer to the start, held until the test settles it
  readonly heldStart?: Promise<void>;

  // the answer to the hang-up, held until the test settles it
  readonly heldHangUp?: Promise<void>;

  // who the server says ended the call in its hang-up reply; the default is the hang-up itself
  readonly hangUpEndedBy?: 'you' | 'budget';
}

function setupTest(options: SetupOptions = {}) {
  const stub = buildStubCallEnvironment({ microphoneError: options.microphoneError ?? null });
  const timer = buildStubTimer();

  const record: { started: number; connects: string[]; hangUps: string[] } = {
    started: 0,
    connects: [],
    hangUps: [],
  };

  const connectErrors = [...(options.connectErrors ?? [])];

  const calls: ContractClient['calls'] = {
    start: () => {
      record.started += 1;

      return (options.heldStart ?? Promise.resolve()).then(() => ({
        callID: 'c1',
        state: 'connecting',
        thread: 't1',
      }));
    },
    connect: (input) => {
      record.connects.push(input.sdpOffer);

      if (record.connects.length === options.heldConnect?.call) {
        return options.heldConnect.result;
      }

      const code = connectErrors.shift();

      if (code !== undefined && code !== null) {
        return Promise.reject(Object.assign(new Error(code), { code }));
      }

      return Promise.resolve({ sdpAnswer: `answer-${String(record.connects.length)}` });
    },
    hangUp: (input) => {
      record.hangUps.push(input.callID);

      return (options.heldHangUp ?? Promise.resolve()).then(() => ({
        callID: input.callID,
        state: 'ended',
        endedBy: options.hangUpEndedBy ?? 'you',
      }));
    },
    get: () => Promise.resolve({ callID: 'c1', state: 'live', endedBy: null, reconnect: null }),
  };

  const session = createCallSession({
    calls,
    environment: stub.environment,
    startTimer: timer.startTimer,
    now: () => 1000,
  });

  const readCalls = (): Calls => record;

  return { ...stub, session, timer, readCalls };
}

test('#start asks for the microphone, starts the call, connects it and goes live', async () => {
  const ctx = setupTest();

  await ctx.session.start();

  expect({
    phase: ctx.session.getSnapshot().phase,
    callID: ctx.session.getSnapshot().callID,
    thread: ctx.session.getSnapshot().thread,
    microphoneRequests: ctx.microphoneRequests(),
    offers: ctx.readCalls().connects,
    answers: ctx.peers[0]?.answers,
  }).toStrictEqual({
    phase: 'live',
    callID: 'c1',
    thread: 't1',
    microphoneRequests: 1,
    offers: ['offer-1'],
    answers: ['answer-1'],
  });
});

test.each([
  { name: 'a blocked prompt', error: 'NotAllowedError', refusal: 'microphone-blocked' },
  { name: 'a device that is missing', error: 'NotFoundError', refusal: 'microphone-missing' },
  { name: 'any other failure', error: 'AbortError', refusal: 'microphone-failed' },
] as const)('#start refuses the call, and starts none, after $name', async (row) => {
  const ctx = setupTest({ microphoneError: Object.assign(new Error('no'), { name: row.error }) });

  await ctx.session.start();

  expect({
    phase: ctx.session.getSnapshot().phase,
    refusal: ctx.session.getSnapshot().refusal,
    started: ctx.readCalls().started,
  }).toStrictEqual({ phase: 'refused', refusal: row.refusal, started: 0 });
});

test('#start ends a call that the server refused to connect, and gives the refusal', async () => {
  const ctx = setupTest({ connectErrors: ['CALL_BUDGET_REACHED'] });

  await ctx.session.start();

  expect({
    phase: ctx.session.getSnapshot().phase,
    refusal: ctx.session.getSnapshot().refusal,
    hangUps: ctx.readCalls().hangUps,
    isClosed: ctx.peers[0]?.isClosed(),
  }).toStrictEqual({
    phase: 'refused',
    refusal: 'budget-reached',
    hangUps: ['c1'],
    isClosed: true,
  });
});

test('#hangUp ends the call as the user, and stops the microphone and the peer', async () => {
  const ctx = setupTest();

  await ctx.session.start();
  await ctx.session.hangUp();

  expect({
    phase: ctx.session.getSnapshot().phase,
    endedBy: ctx.session.getSnapshot().endedBy,
    hangUps: ctx.readCalls().hangUps,
    isClosed: ctx.peers[0]?.isClosed(),
  }).toStrictEqual({ phase: 'ended', endedBy: 'you', hangUps: ['c1'], isClosed: true });
});

test('#toggleMute turns the microphone track off and on', async () => {
  const ctx = setupTest();

  await ctx.session.start();

  ctx.session.toggleMute();

  const muted = [ctx.tracks[0]?.enabled, ctx.session.getSnapshot().isMuted];

  ctx.session.toggleMute();

  expect([muted, [ctx.tracks[0]?.enabled, ctx.session.getSnapshot().isMuted]]).toStrictEqual([
    [false, true],
    [true, false],
  ]);
});

test('#observe sends an ICE-restart offer on the open peer and a fresh connect when the server waits for one', async () => {
  const ctx = setupTest();

  await ctx.session.start();

  ctx.session.observe({ state: 'live', endedBy: null, reconnect: 'restart' });

  await waitFor(() => {
    expect(ctx.peers[0]?.answers).toHaveLength(2);
  });

  ctx.peers[0]?.emitConnectionState('connected');
  expect(ctx.session.getSnapshot().phase).toBe('live');

  expect({
    peers: ctx.peers.length,
    offers: ctx.peers[0]?.offers,
    connects: ctx.readCalls().connects,
    answers: ctx.peers[0]?.answers,
  }).toStrictEqual({
    peers: 1,
    offers: [{ isRestart: false }, { isRestart: true }],
    connects: ['offer-1', 'offer-2'],
    answers: ['answer-1', 'answer-2'],
  });
});

test('#observe sends the new offer again after the timer when the server refuses it, until the server takes it', async () => {
  const ctx = setupTest({ connectErrors: [null, 'SPEECH_UNAVAILABLE'] });

  await ctx.session.start();

  ctx.session.observe({ state: 'live', endedBy: null, reconnect: 'dropped' });

  await waitFor(() => {
    expect(ctx.timer.countPending()).toBe(2);
  });

  const waiting = ctx.session.getSnapshot().phase;

  ctx.timer.advance(2000);

  await waitFor(() => {
    expect(ctx.peers[0]?.answers).toHaveLength(2);
  });

  ctx.peers[0]?.emitConnectionState('connected');
  expect(ctx.session.getSnapshot().phase).toBe('live');

  expect([waiting, ctx.readCalls().connects]).toStrictEqual([
    'reconnecting',
    ['offer-1', 'offer-2', 'offer-3'],
  ]);
});

test('#observe keeps the call reconnecting while the server refuses the new offer as already connected', async () => {
  const ctx = setupTest({ connectErrors: [null, 'CALL_CONNECTED'] });

  await ctx.session.start();

  ctx.session.observe({ state: 'live', endedBy: null, reconnect: 'dropped' });

  await waitFor(() => {
    expect(ctx.timer.countPending()).toBe(2);
  });

  expect([ctx.session.getSnapshot().phase, ctx.readCalls().connects]).toStrictEqual([
    'reconnecting',
    ['offer-1', 'offer-2'],
  ]);
});

test('#observe gives up a call that is not back after 30 s, stops the microphone and the peer, and ends it on the server', async () => {
  const ctx = setupTest({
    connectErrors: [null, 'SPEECH_UNAVAILABLE', 'SPEECH_UNAVAILABLE', 'SPEECH_UNAVAILABLE'],
  });

  await ctx.session.start();

  ctx.session.observe({ state: 'live', endedBy: null, reconnect: 'dropped' });

  await waitFor(() => {
    expect(ctx.timer.countPending()).toBe(2);
  });

  ctx.timer.advance(30_000);

  expect({
    phase: ctx.session.getSnapshot().phase,
    endedBy: ctx.session.getSnapshot().endedBy,
    isClosed: ctx.peers[0]?.isClosed(),
    stoppedTracks: ctx.stoppedTracks(),
    hangUps: ctx.readCalls().hangUps,
  }).toStrictEqual({
    phase: 'ended',
    endedBy: 'dropped',
    isClosed: true,
    stoppedTracks: 1,
    hangUps: ['c1'],
  });
});

test('#hangUp while the call starts stops the microphone, and ends the call that then opens', async () => {
  const held = Promise.withResolvers<void>();
  const ctx = setupTest({ heldStart: held.promise });
  const starting = ctx.session.start();

  await waitFor(() => {
    expect(ctx.session.getSnapshot().phase).toBe('starting');
  });

  const hangingUp = ctx.session.hangUp();
  const stoppedBeforeStart = ctx.stoppedTracks();

  held.resolve();

  await hangingUp;
  await starting;

  await waitFor(() => {
    expect(ctx.readCalls().hangUps).toStrictEqual(['c1']);
  });

  expect({
    stoppedBeforeStart,
    phase: ctx.session.getSnapshot().phase,
    connects: ctx.readCalls().connects,
  }).toStrictEqual({ stoppedBeforeStart: 1, phase: 'idle', connects: [] });
});

test('#hangUp while the call starts settles only after the call that opens is hung up', async () => {
  const held = Promise.withResolvers<void>();
  const heldHangUp = Promise.withResolvers<void>();
  const ctx = setupTest({ heldStart: held.promise, heldHangUp: heldHangUp.promise });
  const starting = ctx.session.start();

  await waitFor(() => {
    expect(ctx.session.getSnapshot().phase).toBe('starting');
  });

  const hangingUp = ctx.session.hangUp();

  held.resolve();

  await waitFor(() => {
    expect(ctx.readCalls().hangUps).toStrictEqual(['c1']);
  });

  const whileHangUpHeld = await Promise.race([hangingUp, Promise.resolve('pending' as const)]);

  heldHangUp.resolve();

  await hangingUp;
  await starting;

  expect(whileHangUpHeld).toBe('pending');
});

test('#hangUp during a pending first connect keeps the call ended when the connect then fails', async () => {
  const held = Promise.withResolvers<{ sdpAnswer: string }>();
  const ctx = setupTest({ heldConnect: { call: 1, result: held.promise } });
  const starting = ctx.session.start();

  await waitFor(() => {
    expect(ctx.readCalls().connects).toHaveLength(1);
  });

  await ctx.session.hangUp();

  held.reject(Object.assign(new Error('SPEECH_UNAVAILABLE'), { code: 'SPEECH_UNAVAILABLE' }));

  await starting;

  expect([ctx.session.getSnapshot().phase, ctx.session.getSnapshot().endedBy]).toStrictEqual([
    'ended',
    'you',
  ]);
});

test('#hangUp during a pending first connect keeps the call ended when the connect then succeeds', async () => {
  const held = Promise.withResolvers<{ sdpAnswer: string }>();
  const ctx = setupTest({ heldConnect: { call: 1, result: held.promise } });
  const starting = ctx.session.start();

  await waitFor(() => {
    expect(ctx.readCalls().connects).toHaveLength(1);
  });

  await ctx.session.hangUp();

  held.resolve({ sdpAnswer: 'late-answer' });

  await starting;

  expect(ctx.session.getSnapshot().phase).toBe('ended');
});

test('#hangUp during a pending reconnect keeps the call ended when the reconnect then succeeds', async () => {
  const held = Promise.withResolvers<{ sdpAnswer: string }>();
  const ctx = setupTest({ heldConnect: { call: 2, result: held.promise } });

  await ctx.session.start();

  ctx.session.observe({ state: 'live', endedBy: null, reconnect: 'restart' });

  await waitFor(() => {
    expect(ctx.readCalls().connects).toHaveLength(2);
  });

  await ctx.session.hangUp();

  held.resolve({ sdpAnswer: 'late-answer' });

  // the session awaited the connect first, so it has run on to its next wait when this resumes
  await held.promise;

  expect({
    phase: ctx.session.getSnapshot().phase,
    answers: ctx.peers[0]?.answers,
    pendingTimers: ctx.timer.countPending(),
  }).toStrictEqual({ phase: 'ended', answers: ['answer-1'], pendingTimers: 0 });
});

test('#hangUp keeps the call from refusing or going live while the hang-up request runs', async () => {
  const held = Promise.withResolvers<{ sdpAnswer: string }>();
  const heldHangUp = Promise.withResolvers<void>();

  const ctx = setupTest({
    heldConnect: { call: 1, result: held.promise },
    heldHangUp: heldHangUp.promise,
  });

  const starting = ctx.session.start();

  await waitFor(() => {
    expect(ctx.readCalls().connects).toHaveLength(1);
  });

  const hangingUp = ctx.session.hangUp();

  held.reject(Object.assign(new Error('SPEECH_UNAVAILABLE'), { code: 'SPEECH_UNAVAILABLE' }));

  await starting;

  const whileHangingUp = ctx.session.getSnapshot().phase;

  heldHangUp.resolve();

  await hangingUp;

  expect({
    whileHangingUp,
    phase: ctx.session.getSnapshot().phase,
    endedBy: ctx.session.getSnapshot().endedBy,
    hangUps: ctx.readCalls().hangUps,
    stoppedTracks: ctx.stoppedTracks(),
  }).toStrictEqual({
    whileHangingUp: 'connecting',
    phase: 'ended',
    endedBy: 'you',
    hangUps: ['c1'],
    stoppedTracks: 1,
  });
});

test('#hangUp sends one request when the user hangs up twice', async () => {
  const heldHangUp = Promise.withResolvers<void>();
  const ctx = setupTest({ heldHangUp: heldHangUp.promise });

  await ctx.session.start();

  const first = ctx.session.hangUp();
  const second = ctx.session.hangUp();

  heldHangUp.resolve();

  await Promise.all([first, second]);

  expect(ctx.readCalls().hangUps).toStrictEqual(['c1']);
});

test.each([['CALL_NOT_FOUND'], ['NOT_CARRYING_SESSION']])(
  '#observe ends the call, and stops the microphone and the peer, when the server refuses the new offer as %s',
  async (code) => {
    const ctx = setupTest({ connectErrors: [null, code] });

    await ctx.session.start();

    ctx.session.observe({ state: 'live', endedBy: null, reconnect: 'dropped' });

    await waitFor(() => {
      expect(ctx.session.getSnapshot().phase).toBe('ended');
    });

    ctx.timer.advance(30_000);

    expect({
      endedBy: ctx.session.getSnapshot().endedBy,
      isClosed: ctx.peers[0]?.isClosed(),
      stoppedTracks: ctx.stoppedTracks(),
      pendingTimers: ctx.timer.countPending(),
    }).toStrictEqual({ endedBy: 'dropped', isClosed: true, stoppedTracks: 1, pendingTimers: 0 });
  },
);

test('#observe gives up a call whose new offer was answered but whose connection did not come back within 30 s', async () => {
  const ctx = setupTest();

  await ctx.session.start();

  ctx.session.observe({ state: 'live', endedBy: null, reconnect: 'restart' });

  await waitFor(() => {
    expect(ctx.peers[0]?.answers).toHaveLength(2);
  });

  const waiting = ctx.session.getSnapshot().phase;

  ctx.timer.advance(30_000);

  expect({
    waiting,
    phase: ctx.session.getSnapshot().phase,
    endedBy: ctx.session.getSnapshot().endedBy,
    isClosed: ctx.peers[0]?.isClosed(),
    stoppedTracks: ctx.stoppedTracks(),
  }).toStrictEqual({
    waiting: 'reconnecting',
    phase: 'ended',
    endedBy: 'dropped',
    isClosed: true,
    stoppedTracks: 1,
  });
});

test('#observe keeps a call that connected after its new offer live past 30 s', async () => {
  const ctx = setupTest();

  await ctx.session.start();

  ctx.session.observe({ state: 'live', endedBy: null, reconnect: 'restart' });

  await waitFor(() => {
    expect(ctx.peers[0]?.answers).toHaveLength(2);
  });

  ctx.peers[0]?.emitConnectionState('connected');
  ctx.timer.advance(30_000);

  expect([ctx.session.getSnapshot().phase, ctx.timer.countPending()]).toStrictEqual(['live', 0]);
});

test('#dispose stops the microphone and the peer of a call that is still open', async () => {
  const ctx = setupTest();

  await ctx.session.start();

  ctx.session.dispose();

  expect([ctx.peers[0]?.isClosed(), ctx.stoppedTracks()]).toStrictEqual([true, 1]);
});

test('#observe reconnects on a new peer when the connection failed', async () => {
  const ctx = setupTest();

  await ctx.session.start();

  ctx.peers[0]?.emitConnectionState('failed');

  await waitFor(() => {
    expect(ctx.peers[1]?.answers).toHaveLength(1);
  });

  ctx.peers[1]?.emitConnectionState('connected');
  expect(ctx.session.getSnapshot().phase).toBe('live');

  expect({ peers: ctx.peers.length, firstClosed: ctx.peers[0]?.isClosed() }).toStrictEqual({
    peers: 2,
    firstClosed: true,
  });
});

test('#observe ends the call when the server says it ended, and says who ended it', async () => {
  const ctx = setupTest();

  await ctx.session.start();

  ctx.session.observe({ state: 'ended', endedBy: 'budget', reconnect: null });

  expect({
    phase: ctx.session.getSnapshot().phase,
    endedBy: ctx.session.getSnapshot().endedBy,
    isClosed: ctx.peers[0]?.isClosed(),
  }).toStrictEqual({ phase: 'ended', endedBy: 'budget', isClosed: true });
});

test('#dismiss readies the screen for a new call after the last one ended', async () => {
  const ctx = setupTest();

  await ctx.session.start();
  await ctx.session.hangUp();

  ctx.session.dismiss();

  expect(ctx.session.getSnapshot().phase).toBe('idle');
});

test('#observe notes when the reconnect finished, so a read of the call from before it can be told apart', async () => {
  const ctx = setupTest();

  await ctx.session.start();

  const before = ctx.session.getSnapshot().reconnectedAtMs;

  ctx.session.observe({ state: 'live', endedBy: null, reconnect: 'restart' });

  await waitFor(() => {
    expect(ctx.peers[0]?.answers).toHaveLength(2);
  });

  ctx.peers[0]?.emitConnectionState('connected');
  expect([before, ctx.session.getSnapshot().reconnectedAtMs]).toStrictEqual([null, 1000]);
});

test('#observe ignores a replaced peer that reports connected, and keeps the limit armed', async () => {
  const ctx = setupTest();

  await ctx.session.start();

  ctx.peers[0]?.emitConnectionState('failed');

  await waitFor(() => {
    expect(ctx.peers[1]?.answers).toHaveLength(1);
  });

  ctx.peers[0]?.emitConnectionState('connected');
  const afterOldPeer = ctx.session.getSnapshot().phase;

  ctx.timer.advance(30_000);

  expect([
    afterOldPeer,
    ctx.session.getSnapshot().phase,
    ctx.session.getSnapshot().endedBy,
  ]).toStrictEqual(['reconnecting', 'ended', 'dropped']);
});

test('#hangUp starts no reconnect when the server reports a dropped session while the hang-up runs', async () => {
  const heldHangUp = Promise.withResolvers<void>();
  const ctx = setupTest({ heldHangUp: heldHangUp.promise });

  await ctx.session.start();

  const hangingUp = ctx.session.hangUp();

  ctx.session.observe({ state: 'live', endedBy: null, reconnect: 'dropped' });
  heldHangUp.resolve();

  await hangingUp;

  ctx.session.observe({ state: 'live', endedBy: null, reconnect: 'dropped' });

  expect({
    connects: ctx.readCalls().connects,
    offers: ctx.peers[0]?.offers,
    endedBy: ctx.session.getSnapshot().endedBy,
  }).toStrictEqual({
    connects: ['offer-1'],
    offers: [{ isRestart: false }],
    endedBy: 'you',
  });
});

test('#hangUp keeps the reason the server gave for an end that came while the hang-up ran', async () => {
  const heldHangUp = Promise.withResolvers<void>();
  const ctx = setupTest({ heldHangUp: heldHangUp.promise });

  await ctx.session.start();

  const hangingUp = ctx.session.hangUp();

  ctx.session.observe({ state: 'ended', endedBy: 'budget', reconnect: null });
  heldHangUp.resolve();

  await hangingUp;

  expect(ctx.session.getSnapshot().endedBy).toBe('budget');
});

test('#hangUp keeps the reason from the hang-up reply when the server ended the call first', async () => {
  const ctx = setupTest({ hangUpEndedBy: 'budget' });

  await ctx.session.start();
  await ctx.session.hangUp();

  expect([ctx.session.getSnapshot().phase, ctx.session.getSnapshot().endedBy]).toStrictEqual([
    'ended',
    'budget',
  ]);
});

test('#observe keeps the call reconnecting when the peer still reports the connected state from before the restart', async () => {
  const ctx = setupTest();

  await ctx.session.start();

  ctx.peers[0]?.emitConnectionState('connected');
  ctx.session.observe({ state: 'live', endedBy: null, reconnect: 'restart' });

  await waitFor(() => {
    expect(ctx.peers[0]?.answers).toHaveLength(2);
  });

  const afterAnswer = ctx.session.getSnapshot().phase;

  ctx.peers[0]?.emitConnectionState('connected');
  expect([afterAnswer, ctx.session.getSnapshot().phase]).toStrictEqual(['reconnecting', 'live']);
});

test('#observe gives up 30 s after the first loss, however many offers and losses came between', async () => {
  const ctx = setupTest({ connectErrors: [null, 'SPEECH_UNAVAILABLE', null] });

  await ctx.session.start();

  ctx.session.observe({ state: 'live', endedBy: null, reconnect: 'dropped' });

  await waitFor(() => {
    expect(ctx.timer.countPending()).toBe(2);
  });

  ctx.timer.advance(2000);

  await waitFor(() => {
    expect(ctx.peers[0]?.answers).toHaveLength(2);
  });

  ctx.timer.advance(18_000);
  ctx.peers[0]?.emitConnectionState('failed');

  await waitFor(() => {
    expect(ctx.peers[1]?.answers).toHaveLength(1);
  });

  const before = ctx.session.getSnapshot().phase;

  ctx.timer.advance(9999);

  const justBefore = ctx.session.getSnapshot().phase;

  ctx.timer.advance(1);

  expect([before, justBefore, ctx.session.getSnapshot().phase]).toStrictEqual([
    'reconnecting',
    'reconnecting',
    'ended',
  ]);
});
