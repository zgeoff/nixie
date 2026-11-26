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

function setupTest(
  options: { readonly microphoneError?: Error; readonly connectErrors?: (string | null)[] } = {},
) {
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

      return Promise.resolve({ callID: 'c1', state: 'connecting', thread: 't1' });
    },
    connect: (input) => {
      record.connects.push(input.sdpOffer);

      const code = connectErrors.shift();

      if (code !== undefined && code !== null) {
        return Promise.reject(Object.assign(new Error(code), { code }));
      }

      return Promise.resolve({ sdpAnswer: `answer-${String(record.connects.length)}` });
    },
    hangUp: (input) => {
      record.hangUps.push(input.callID);

      return Promise.resolve({ callID: input.callID, state: 'ended' });
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
    expect(ctx.session.getSnapshot().phase).toBe('live');
  });

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
    expect(ctx.timer.countPending()).toBe(1);
  });

  const waiting = ctx.session.getSnapshot().phase;

  ctx.timer.advance(2000);

  await waitFor(() => {
    expect(ctx.session.getSnapshot().phase).toBe('live');
  });

  expect([waiting, ctx.readCalls().connects]).toStrictEqual([
    'reconnecting',
    ['offer-1', 'offer-2', 'offer-3'],
  ]);
});

test('#observe keeps the call live when the server already holds a session from an earlier offer', async () => {
  const ctx = setupTest({ connectErrors: [null, 'CALL_CONNECTED'] });

  await ctx.session.start();

  ctx.session.observe({ state: 'live', endedBy: null, reconnect: 'dropped' });

  await waitFor(() => {
    expect(ctx.session.getSnapshot().phase).toBe('live');
  });

  expect(ctx.readCalls().connects).toStrictEqual(['offer-1', 'offer-2']);
});

test('#observe reconnects on a new peer when the connection failed', async () => {
  const ctx = setupTest();

  await ctx.session.start();

  ctx.peers[0]?.emitConnectionState('failed');

  await waitFor(() => {
    expect(ctx.session.getSnapshot().phase).toBe('live');
  });

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
