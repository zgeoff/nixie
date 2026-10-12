import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startTestNixie } from '../../../apps/server/src/test-utils/start-test-nixie';
import { buildLiveClient } from './build-live-client';

// a test build of nixie's server at ready, and the enrolment code it issued at start
async function setupTest() {
  const nixie = await startTestNixie();
  const listening = await nixie.waitForLogEvent('http.listening');
  const issued = await nixie.waitForLogEvent('enrolment_code.issued');

  await nixie.waitForLogEvent('ready');

  return { url: `http://127.0.0.1:${String(listening['port'])}`, code: String(issued['code']) };
}

test('it enrols without a token, then calls the API as the device with its bearer token', async () => {
  const ctx = await setupTest();
  const enrolled = await buildLiveClient(ctx.url, null).sessions.enrol({
    clientActionID: crypto.randomUUID(),
    code: ctx.code,
    deviceName: 'live check',
    tokenDelivery: 'bearer',
  });

  invariant(enrolled.token);

  const listed = await buildLiveClient(`${ctx.url}/`, enrolled.token).sessions.list();

  expect(listed.sessions).toMatchObject([
    { sessionID: enrolled.sessionID, deviceName: 'live check', current: true },
  ]);
}, 60_000);

test('it rejects with the code the API answers for a token that is no session', async () => {
  const ctx = await setupTest();

  const call = buildLiveClient(ctx.url, 'not-a-session').sessions.list();

  expect(call).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
}, 60_000);
