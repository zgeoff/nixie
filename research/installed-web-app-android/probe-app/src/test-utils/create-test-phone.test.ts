import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { makeProbeHandler } from '../make-probe-handler.ts';
import { createTestPhone } from './create-test-phone.ts';

test('it subscribes with a session cookie and reads a push sent to it', async () => {
  const bodies: Uint8Array<ArrayBuffer>[] = [];
  const pushService = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: async (request) => {
      bodies.push(new Uint8Array(await request.arrayBuffer()));

      return new Response(null, { status: 201 });
    },
  });

  onTestFinished(() => pushService.stop(true));

  const vapidPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const vapidKeys = {
    privateKey: vapidPair.privateKey,
    publicKey: Buffer.from(await crypto.subtle.exportKey('raw', vapidPair.publicKey)).toString(
      'base64url',
    ),
  };
  const answerRequest = makeProbeHandler({
    vapidKeys,
    adminKey: 'test-admin-key',
    publicDirectory: join(import.meta.dir, '..', '..', 'public'),
    isPushEndpointAllowed: () => true,
    now: () => Date.UTC(2026, 9, 30, 9, 0, 0),
  });
  const endpoint = new URL('/push/phone', pushService.url).href;

  const phone = await createTestPhone(answerRequest, endpoint);
  const subscriptions = await answerRequest(
    new Request('http://probe.test/api/subscriptions', {
      headers: { 'x-probe-admin': 'test-admin-key' },
    }),
  );

  await answerRequest(
    new Request('http://probe.test/api/push', {
      method: 'POST',
      headers: { cookie: phone.cookie, 'x-nixie-client': 'test' },
      body: JSON.stringify({ title: 'hello phone' }),
    }),
  );

  expect(phone.cookie).toMatch(/^probe_session=[\w-]{43}$/);
  expect(await subscriptions.json()).toStrictEqual([
    { session: expect.stringMatching(/^S-/), pushService: pushService.url.host },
  ]);
  expect(await phone.readPush(bodies[0] ?? new Uint8Array())).toMatchObject({
    title: 'hello phone',
  });
});
