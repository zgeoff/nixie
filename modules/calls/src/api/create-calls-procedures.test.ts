import { expect, onTestFinished, test } from 'bun:test';
import { runComputerAction, verifySessionToken } from '@heynixie/api';
import { buildTestClient, createDeviceSession, startTestAPI } from '@heynixie/api/test-utils';
import { registerFaultPointAction } from '@heynixie/memory/test-utils';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { startCall } from '../start/start-call';
import type { TestCallsOptions } from '../test-utils/start-test-calls';
import { startTestCallsAPI } from '../test-utils/start-test-calls-api';
import { readCall } from '../utils/read-call';

async function setupTest(options: TestCallsOptions = {}) {
  const api = await startTestCallsAPI(options);
  const owner = await createDeviceSession(api.context, 'phone');

  return { ...api, owner, client: buildTestClient(api.url, owner.token) };
}

test('#calls.start opens a call that the calling session carries', async () => {
  const ctx = await setupTest();
  const started = await ctx.client.calls.start({ clientActionID: crypto.randomUUID() });

  expect(started).toStrictEqual({
    callID: expect.any(String),
    state: 'connecting',
    thread: expect.any(String),
  });
});

test('#calls.start answers a retry of one action ID with the same call', async () => {
  const ctx = await setupTest();

  const clientActionID = crypto.randomUUID();

  const first = await ctx.client.calls.start({ clientActionID });
  const retry = await ctx.client.calls.start({ clientActionID });

  expect(retry).toStrictEqual(first);
});

test('#calls.start refuses a second call while one runs', async () => {
  const ctx = await setupTest();

  await ctx.client.calls.start({ clientActionID: crypto.randomUUID() });

  const second = ctx.client.calls.start({ clientActionID: crypto.randomUUID() });

  await Promise.allSettled([second]);

  expect(second).rejects.toMatchObject({ code: 'CALL_RUNNING' });
});

test('#calls.start answers FEATURE_OFF when the server holds no calls module', async () => {
  const api = await startTestAPI();
  const owner = await createDeviceSession(api.context, 'phone');

  const client = buildTestClient(api.url, owner.token);
  const refused = client.calls.start({ clientActionID: crypto.randomUUID() });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'FEATURE_OFF', data: { feature: 'voice' } });
});

test('#calls.start answers VOICE_OFF when the voice config is left out', async () => {
  const api = await startTestCallsAPI({ voice: 'off' });
  const owner = await createDeviceSession(api.context, 'phone');

  const client = buildTestClient(api.url, owner.token);
  const refused = client.calls.start({ clientActionID: crypto.randomUUID() });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'VOICE_OFF' });
});

test('#calls.start answers SPEECH_UNAVAILABLE when no speech layer is wired', async () => {
  const api = await startTestCallsAPI({ speech: 'absent' });
  const owner = await createDeviceSession(api.context, 'phone');

  const client = buildTestClient(api.url, owner.token);
  const refused = client.calls.start({ clientActionID: crypto.randomUUID() });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'SPEECH_UNAVAILABLE' });
});

test('#calls.start names voice/voice.yaml when the definitions hold no price', async () => {
  const api = await startTestCallsAPI({ pricePerMinuteMicros: null });
  const owner = await createDeviceSession(api.context, 'phone');

  const client = buildTestClient(api.url, owner.token);
  const refused = client.calls.start({ clientActionID: crypto.randomUUID() });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({
    code: 'VOICE_PRICE_MISSING',
    message: expect.stringContaining('voice/voice.yaml'),
  });
});

test('#calls.start refuses a caller that has no session', async () => {
  const ctx = await setupTest();

  const anonymous = buildTestClient(ctx.url);
  const refused = anonymous.calls.start({ clientActionID: crypto.randomUUID() });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#calls.connect answers the offer of the carrying session', async () => {
  const ctx = await setupTest();
  const started = await ctx.client.calls.start({ clientActionID: crypto.randomUUID() });
  const connected = await ctx.client.calls.connect({ callID: started.callID, sdpOffer: 'offer' });

  expect(connected).toStrictEqual({ sdpAnswer: 'fake-answer-1' });
});

test('#calls.get reads a live call as one that waits for no offer', async () => {
  const ctx = await setupTest();
  const started = await ctx.client.calls.start({ clientActionID: crypto.randomUUID() });

  await ctx.client.calls.connect({ callID: started.callID, sdpOffer: 'offer' });

  const connected = await ctx.client.calls.get({ callID: started.callID });

  expect(connected).toStrictEqual({
    callID: started.callID,
    state: 'live',
    endedBy: null,
    reconnect: null,
  });
});

test('#calls.start answers a retry of a call started before the call screen with the thread of the call', async () => {
  const ctx = await setupTest();

  const clientActionID = crypto.randomUUID();

  const caller = await verifySessionToken(ctx.context, ctx.owner.token);

  const calls = ctx.calls.context;

  invariant(caller !== null, 'the owner session verifies');

  const earlier = await runComputerAction(
    ctx.context,
    caller,
    { procedure: 'calls.start', clientActionID, input: {} },
    async () => {
      const result = await startCall(calls, { carryingSession: caller.identityID });

      invariant(result.status === 'started', 'the test call starts');

      return { callID: result.callID };
    },
  );

  invariant(earlier.status === 'done', 'the earlier start finished');

  const call = await readCall(ctx.writer.db, z.string().parse(earlier.result['callID']));
  const retry = await ctx.client.calls.start({ clientActionID });

  invariant(call !== null, 'the earlier start made a call');

  expect(retry).toStrictEqual({ callID: call.callID, state: 'connecting', thread: call.taskID });
});

test('#calls.get reads who ended a call', async () => {
  const ctx = await setupTest();
  const started = await ctx.client.calls.start({ clientActionID: crypto.randomUUID() });

  await ctx.client.calls.hangUp({ callID: started.callID, clientActionID: crypto.randomUUID() });

  const ended = await ctx.client.calls.get({ callID: started.callID });

  expect(ended).toStrictEqual({
    callID: started.callID,
    state: 'ended',
    endedBy: 'you',
    reconnect: null,
  });
});

test('#calls.get refuses a call that does not exist', async () => {
  const ctx = await setupTest();

  const refused = ctx.client.calls.get({ callID: 'nothing' });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'CALL_NOT_FOUND' });
});

test('#calls.connect refuses a session that does not carry the call', async () => {
  const ctx = await setupTest();
  const started = await ctx.client.calls.start({ clientActionID: crypto.randomUUID() });
  const other = await createDeviceSession(ctx.context, 'laptop');

  const refused = buildTestClient(ctx.url, other.token).calls.connect({
    callID: started.callID,
    sdpOffer: 'offer',
  });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'NOT_CARRYING_SESSION' });
});

test('#calls.connect refuses a call that does not exist', async () => {
  const ctx = await setupTest();

  const refused = ctx.client.calls.connect({ callID: 'nothing', sdpOffer: 'offer' });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'CALL_NOT_FOUND' });
});

test('#calls.hangUp ends the call, and answers a retry the same way', async () => {
  const ctx = await setupTest();
  const started = await ctx.client.calls.start({ clientActionID: crypto.randomUUID() });

  await ctx.client.calls.hangUp({ callID: started.callID, clientActionID: crypto.randomUUID() });

  const again = await ctx.client.calls.hangUp({
    callID: started.callID,
    clientActionID: crypto.randomUUID(),
  });

  expect(again).toStrictEqual({ callID: started.callID, state: 'ended', endedBy: 'you' });
});

test('it signals a dropped speech session on the live stream, and a new offer sent after the signal reconnects the call', async () => {
  const ctx = await setupTest();
  const started = await ctx.client.calls.start({ clientActionID: crypto.randomUUID() });

  await ctx.client.calls.connect({ callID: started.callID, sdpOffer: 'offer' });

  const stream = await ctx.client.live.follow({});

  onTestFinished(() => stream.return(undefined));

  const opened = await stream.next();

  ctx.calls.speech.emit('fake-session-1', { kind: 'dropped' });

  let signalled = false;

  while (!signalled) {
    const event = await stream.next();

    if (event.done === true) {
      break;
    }

    signalled = event.value.kind === 'changed' && event.value.topics.includes('calls');
  }

  expect(signalled).toBe(true);

  const waiting = await ctx.client.calls.get({ callID: started.callID });
  const answer = await ctx.client.calls.connect({ callID: started.callID, sdpOffer: 'offer-2' });
  const after = await ctx.client.calls.get({ callID: started.callID });

  expect({
    opened: opened.value,
    waiting: waiting.reconnect,
    answer,
    after: after.reconnect,
  }).toStrictEqual({
    opened: { kind: 'opened' },
    waiting: 'dropped',
    answer: { sdpAnswer: 'fake-answer-2' },
    after: null,
  });
});

test('#calls.hangUp refuses a call that does not exist', async () => {
  const ctx = await setupTest();

  const refused = ctx.client.calls.hangUp({
    callID: 'nothing',
    clientActionID: crypto.randomUUID(),
  });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'CALL_NOT_FOUND' });
});

test('#calls.connect refuses a session that is revoked right after its check passes, and opens no speech session', async () => {
  const ctx = await setupTest();
  const started = await ctx.client.calls.start({ clientActionID: crypto.randomUUID() });

  registerFaultPointAction('session.checked', () =>
    ctx.client.sessions.revoke({
      clientActionID: crypto.randomUUID(),
      sessionID: ctx.owner.sessionID,
    }),
  );

  const refused = ctx.client.calls.connect({ callID: started.callID, sdpOffer: 'offer' });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(ctx.calls.speech.calls).toStrictEqual([]);
});

test('#calls.hangUp refuses an action ID that an earlier hang-up of another call used, and ends nothing', async () => {
  const ctx = await setupTest();

  const clientActionID = crypto.randomUUID();

  const first = await ctx.client.calls.start({ clientActionID: crypto.randomUUID() });

  await ctx.client.calls.hangUp({ callID: first.callID, clientActionID });

  const second = await ctx.client.calls.start({ clientActionID: crypto.randomUUID() });

  const reused = ctx.client.calls.hangUp({ callID: second.callID, clientActionID });

  await Promise.allSettled([reused]);

  const call = await readCall(ctx.writer.db, second.callID);

  expect(reused).rejects.toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
  expect(call?.state).toBe('connecting');
});

test('#sessions.signOut ends the call that the signing out session carries', async () => {
  const ctx = await setupTest();
  const started = await ctx.client.calls.start({ clientActionID: crypto.randomUUID() });

  await ctx.client.sessions.signOut({});

  const call = await readCall(ctx.context.log.writer.db, started.callID);

  expect(call).toMatchObject({ state: 'ended', endedBy: 'you' });
});
