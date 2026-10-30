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
  const answerRequest = makeProbeHandler({
    vapidKeys: {
      privateKey: vapidPair.privateKey,
      publicKey: Buffer.from(await crypto.subtle.exportKey('raw', vapidPair.publicKey)).toString(
        'base64url',
      ),
    },
    adminKey: 'test-admin-key',
    publicDirectory: join(import.meta.dir, '..', '..', 'public'),
    clientAssets: new Map(),
    isPushEndpointAllowed: () => true,
    pushTransport: (url, init) => fetch(url, init),
    schedule: () => {},
    readPublicFile: async (path) => {
      const file = Bun.file(path);

      return (await file.exists()) ? file : null;
    },
    startBodyDeadline: () => new AbortController().signal,
    writeError: () => {},
    now: () => Date.UTC(2026, 9, 30, 9, 0, 0),
  });

  const phone = await createTestPhone(
    { answerRequest, adminKey: 'test-admin-key' },
    new URL('/push/phone', pushService.url).href,
  );

  await phone.client.push({
    title: 'hello phone',
    urgency: 'normal',
    tag: '',
    silent: false,
    renotify: false,
    approve: false,
    delaySeconds: 0,
  });

  expect(phone.cookie).toMatch(/^probe_session=[\w-]{43}$/);
  expect(await phone.client.config()).toMatchObject({ session: expect.stringMatching(/^S-/) });
  expect(await phone.readPush(bodies[0] ?? new Uint8Array())).toMatchObject({
    title: 'hello phone',
  });
});
