import { expect, test } from 'bun:test';
import { readCall } from '@heynixie/calls';
import { registerFaultPointAction } from '@heynixie/memory/test-utils';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import { defaultAPISettings } from '../utils/default-api-settings';

async function setupTest() {
  const api = await startTestAPI(defaultAPISettings, { calls: {} });
  const owner = await createDeviceSession(api.context, 'phone');

  return { ...api, owner, client: buildTestClient(api.url, owner.token) };
}

test('#calls.start opens a call that the calling session carries', async () => {
  const ctx = await setupTest();
  const started = await ctx.client.calls.start({ clientActionID: crypto.randomUUID() });

  expect(started).toStrictEqual({ callID: expect.any(String), state: 'connecting' });
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

test('#calls.start answers VOICE_OFF when the server holds no calls module', async () => {
  const api = await startTestAPI();
  const owner = await createDeviceSession(api.context, 'phone');

  const client = buildTestClient(api.url, owner.token);
  const refused = client.calls.start({ clientActionID: crypto.randomUUID() });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'VOICE_OFF' });
});

test('#calls.start answers VOICE_OFF when the voice config is left out', async () => {
  const api = await startTestAPI(defaultAPISettings, { calls: { voice: 'off' } });
  const owner = await createDeviceSession(api.context, 'phone');

  const client = buildTestClient(api.url, owner.token);
  const refused = client.calls.start({ clientActionID: crypto.randomUUID() });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'VOICE_OFF' });
});

test('#calls.start answers SPEECH_UNAVAILABLE when no speech layer is wired', async () => {
  const api = await startTestAPI(defaultAPISettings, { calls: { speech: 'absent' } });
  const owner = await createDeviceSession(api.context, 'phone');

  const client = buildTestClient(api.url, owner.token);
  const refused = client.calls.start({ clientActionID: crypto.randomUUID() });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'SPEECH_UNAVAILABLE' });
});

test('#calls.start names voice/voice.yaml when the definitions hold no price', async () => {
  const api = await startTestAPI(defaultAPISettings, { calls: { pricePerMinuteMicros: null } });
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

  expect(again).toStrictEqual({ callID: started.callID, state: 'ended' });
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
  expect(ctx.calls?.speech.calls).toStrictEqual([]);
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
