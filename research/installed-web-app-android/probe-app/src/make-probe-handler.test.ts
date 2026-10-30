import { expect, mock, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { makeProbeHandler } from './make-probe-handler.ts';
import { createTestPhone } from './test-utils/create-test-phone.ts';

async function setupTest() {
  const received = mock((_body: Uint8Array<ArrayBuffer>, _headers: Headers) => {});
  const pushService = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: async (request) => {
      received(new Uint8Array(await request.arrayBuffer()), request.headers);

      return new Response(null, { status: 201 });
    },
  });

  onTestFinished(() => pushService.stop(true));

  const vapidPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const clock = { nowMs: Date.UTC(2026, 9, 30, 9, 0, 0) };
  const answerRequest = makeProbeHandler({
    vapidKeys: {
      privateKey: vapidPair.privateKey,
      publicKey: Buffer.from(await crypto.subtle.exportKey('raw', vapidPair.publicKey)).toString(
        'base64url',
      ),
    },
    adminKey: 'test-admin-key',
    publicDirectory: join(import.meta.dir, '..', 'public'),
    isPushEndpointAllowed: (endpoint) => endpoint.origin === pushService.url.origin,
    now: () => clock.nowMs,
  });

  return {
    answerRequest,
    clock,
    received,
    endpoint: new URL('/push/phone', pushService.url).href,
  };
}

test('it approves once with the token that the push carried', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);

  await ctx.answerRequest(
    new Request('http://probe.test/api/push', {
      method: 'POST',
      headers: { cookie: phone.cookie, 'x-nixie-client': 'test' },
      body: JSON.stringify({ approve: true, tag: 'approval' }),
    }),
  );

  const push = await phone.readPush(ctx.received.mock.calls[0]?.[0] ?? new Uint8Array());
  const response = await ctx.answerRequest(
    new Request('http://probe.test/api/approve', {
      method: 'POST',
      headers: { cookie: phone.cookie, 'x-nixie-client': 'probe-sw' },
      body: JSON.stringify(push.approval),
    }),
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toStrictEqual({ approved: true });
});

test('it refuses a second approve with a token already used', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);

  await ctx.answerRequest(
    new Request('http://probe.test/api/push', {
      method: 'POST',
      headers: { cookie: phone.cookie, 'x-nixie-client': 'test' },
      body: JSON.stringify({ approve: true }),
    }),
  );

  const push = await phone.readPush(ctx.received.mock.calls[0]?.[0] ?? new Uint8Array());
  const approve = () =>
    ctx.answerRequest(
      new Request('http://probe.test/api/approve', {
        method: 'POST',
        headers: { cookie: phone.cookie, 'x-nixie-client': 'probe-sw' },
        body: JSON.stringify(push.approval),
      }),
    );

  await approve();

  const second = await approve();

  expect(second.status).toBe(409);
  expect(await second.json()).toStrictEqual({ error: 'token already used' });
});

test('it refuses an approve with the wrong token', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);

  await ctx.answerRequest(
    new Request('http://probe.test/api/push', {
      method: 'POST',
      headers: { cookie: phone.cookie, 'x-nixie-client': 'test' },
      body: JSON.stringify({ approve: true }),
    }),
  );

  const push = await phone.readPush(ctx.received.mock.calls[0]?.[0] ?? new Uint8Array());
  const response = await ctx.answerRequest(
    new Request('http://probe.test/api/approve', {
      method: 'POST',
      headers: { cookie: phone.cookie, 'x-nixie-client': 'probe-sw' },
      body: JSON.stringify({ approvalID: push.approval?.approvalID, token: 'guessed-token' }),
    }),
  );

  expect(response.status).toBe(403);
  expect(await response.json()).toStrictEqual({ error: 'wrong token' });
});

test('it refuses an approve from another session', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);
  const otherPage = await ctx.answerRequest(new Request('http://probe.test/'));
  const otherCookie = (otherPage.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

  await ctx.answerRequest(
    new Request('http://probe.test/api/push', {
      method: 'POST',
      headers: { cookie: phone.cookie, 'x-nixie-client': 'test' },
      body: JSON.stringify({ approve: true }),
    }),
  );

  const push = await phone.readPush(ctx.received.mock.calls[0]?.[0] ?? new Uint8Array());
  const response = await ctx.answerRequest(
    new Request('http://probe.test/api/approve', {
      method: 'POST',
      headers: { cookie: otherCookie, 'x-nixie-client': 'probe-sw' },
      body: JSON.stringify(push.approval),
    }),
  );

  expect(response.status).toBe(403);
  expect(await response.json()).toStrictEqual({ error: 'another session' });
});

test('it refuses an approve with no session cookie', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);

  await ctx.answerRequest(
    new Request('http://probe.test/api/push', {
      method: 'POST',
      headers: { cookie: phone.cookie, 'x-nixie-client': 'test' },
      body: JSON.stringify({ approve: true }),
    }),
  );

  const push = await phone.readPush(ctx.received.mock.calls[0]?.[0] ?? new Uint8Array());
  const response = await ctx.answerRequest(
    new Request('http://probe.test/api/approve', {
      method: 'POST',
      headers: { 'x-nixie-client': 'probe-sw' },
      body: JSON.stringify(push.approval),
    }),
  );

  expect(response.status).toBe(401);
  expect(await response.json()).toStrictEqual({ error: 'no session' });
});

test('it refuses an approve after the session signed out', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);

  await ctx.answerRequest(
    new Request('http://probe.test/api/push', {
      method: 'POST',
      headers: { cookie: phone.cookie, 'x-nixie-client': 'test' },
      body: JSON.stringify({ approve: true }),
    }),
  );

  const push = await phone.readPush(ctx.received.mock.calls[0]?.[0] ?? new Uint8Array());
  const signOut = await ctx.answerRequest(
    new Request('http://probe.test/api/sign-out', {
      method: 'POST',
      headers: { cookie: phone.cookie },
    }),
  );
  const response = await ctx.answerRequest(
    new Request('http://probe.test/api/approve', {
      method: 'POST',
      headers: { cookie: phone.cookie, 'x-nixie-client': 'probe-sw' },
      body: JSON.stringify(push.approval),
    }),
  );

  expect(signOut.headers.get('set-cookie')).toStartWith('probe_session=; Path=/; Max-Age=0;');
  expect(response.status).toBe(401);
  expect(await response.json()).toStrictEqual({ error: 'no session' });
});

test('it refuses an approve without the x-nixie-client header', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);

  await ctx.answerRequest(
    new Request('http://probe.test/api/push', {
      method: 'POST',
      headers: { cookie: phone.cookie, 'x-nixie-client': 'test' },
      body: JSON.stringify({ approve: true }),
    }),
  );

  const push = await phone.readPush(ctx.received.mock.calls[0]?.[0] ?? new Uint8Array());
  const response = await ctx.answerRequest(
    new Request('http://probe.test/api/approve', {
      method: 'POST',
      headers: { cookie: phone.cookie },
      body: JSON.stringify(push.approval),
    }),
  );

  expect(response.status).toBe(400);
  expect(await response.json()).toStrictEqual({ error: 'missing x-nixie-client' });
});

test('it refuses an approve 15 minutes after the push', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);

  await ctx.answerRequest(
    new Request('http://probe.test/api/push', {
      method: 'POST',
      headers: { cookie: phone.cookie, 'x-nixie-client': 'test' },
      body: JSON.stringify({ approve: true }),
    }),
  );

  const push = await phone.readPush(ctx.received.mock.calls[0]?.[0] ?? new Uint8Array());

  ctx.clock.nowMs += 15 * 60 * 1000 + 1;

  const response = await ctx.answerRequest(
    new Request('http://probe.test/api/approve', {
      method: 'POST',
      headers: { cookie: phone.cookie, 'x-nixie-client': 'probe-sw' },
      body: JSON.stringify(push.approval),
    }),
  );

  expect(response.status).toBe(410);
  expect(await response.json()).toStrictEqual({ error: 'token expired' });
});

test('it sends a push with the chosen urgency and a VAPID signature', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);

  const response = await ctx.answerRequest(
    new Request('http://probe.test/api/push', {
      method: 'POST',
      headers: { cookie: phone.cookie, 'x-nixie-client': 'test' },
      body: JSON.stringify({ urgency: 'high', tag: 'doze', silent: true, renotify: true }),
    }),
  );

  const headers = ctx.received.mock.calls[0]?.[1];

  expect(response.status).toBe(200);
  expect(headers?.get('urgency')).toBe('high');
  expect(headers?.get('content-encoding')).toBe('aes128gcm');
  expect(headers?.get('authorization')).toStartWith('vapid t=');
  expect(await phone.readPush(ctx.received.mock.calls[0]?.[0] ?? new Uint8Array())).toStrictEqual({
    pushID: expect.any(String),
    sentAt: Date.UTC(2026, 9, 30, 9, 0, 0),
    title: 'nixie probe',
    tag: 'doze',
    silent: true,
    renotify: true,
    urgency: 'high',
    approval: null,
  });
});

test('it refuses a push from a page with neither a session nor the admin key', async () => {
  const ctx = await setupTest();

  await createTestPhone(ctx.answerRequest, ctx.endpoint);

  const response = await ctx.answerRequest(
    new Request('http://probe.test/api/push', {
      method: 'POST',
      headers: { 'x-nixie-client': 'test' },
      body: JSON.stringify({}),
    }),
  );

  expect(response.status).toBe(401);
  expect(ctx.received).not.toHaveBeenCalled();
});

test('it sends to every subscribed phone for the admin key', async () => {
  const ctx = await setupTest();

  await createTestPhone(ctx.answerRequest, ctx.endpoint);
  await createTestPhone(ctx.answerRequest, `${ctx.endpoint}-second`);

  const response = await ctx.answerRequest(
    new Request('http://probe.test/api/push', {
      method: 'POST',
      headers: { 'x-probe-admin': 'test-admin-key' },
      body: JSON.stringify({}),
    }),
  );

  expect(await response.json()).toStrictEqual({ pushID: expect.any(String), statuses: [201, 201] });
});

test('it refuses a subscription to a host that is no push service', async () => {
  const ctx = await setupTest();

  const subscribing = createTestPhone(ctx.answerRequest, 'https://attacker.example/push');

  expect(subscribing).rejects.toThrow(/400 .*unknown push service/);
});

test('it records a share with its fields and files and sends the page to block 6', async () => {
  const ctx = await setupTest();
  const page = await ctx.answerRequest(new Request('http://probe.test/'));
  const cookie = (page.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const form = new FormData();

  form.append('title', 'A shared page');
  form.append('text', 'look at https://example.com/article');
  form.append('files', new File(['fake image bytes'], 'photo.jpg', { type: 'image/jpeg' }));

  const response = await ctx.answerRequest(
    new Request('http://probe.test/share', { method: 'POST', headers: { cookie }, body: form }),
  );
  const location = response.headers.get('location') ?? '';
  const entry = await ctx.answerRequest(
    new Request(`http://probe.test/api/entries/${location.split('share=')[1]}`),
  );

  expect(response.status).toBe(303);
  expect(location).toStartWith('/block-6.html?share=');
  expect(await entry.json()).toStrictEqual({
    id: expect.any(String),
    at: '2026-10-30T09:00:00.000Z',
    session: expect.stringMatching(/^S-/),
    kind: 'share',
    detail: {
      title: 'A shared page',
      text: 'look at https://example.com/article',
      url: null,
      files: [{ name: 'photo.jpg', type: 'image/jpeg', size: 16 }],
      cookieSent: true,
      sessionKnown: true,
      secFetchSite: null,
    },
  });
});

test('it records a share that arrives without the session cookie', async () => {
  const ctx = await setupTest();
  const form = new FormData();

  form.append('url', 'https://example.com/page');

  const response = await ctx.answerRequest(
    new Request('http://probe.test/share', { method: 'POST', body: form }),
  );
  const entry = await ctx.answerRequest(
    new Request(
      `http://probe.test/api/entries/${(response.headers.get('location') ?? '').split('share=')[1]}`,
    ),
  );

  expect(await entry.json()).toMatchObject({
    session: null,
    detail: { url: 'https://example.com/page', cookieSent: false, sessionKnown: false },
  });
});

test('it records a synced message once and answers a repeat as a duplicate', async () => {
  const ctx = await setupTest();
  const page = await ctx.answerRequest(new Request('http://probe.test/'));
  const cookie = (page.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const send = () =>
    ctx.answerRequest(
      new Request('http://probe.test/api/sync', {
        method: 'POST',
        headers: { cookie, 'x-nixie-client': 'probe-sw' },
        body: JSON.stringify({
          messageID: '6f1c2a54-93b7-4c1e-9d4e-2b8f0a7c5e11',
          text: 'buy more tea',
          queuedAt: Date.UTC(2026, 9, 30, 8, 58, 0),
          lastChance: false,
        }),
      }),
    );

  const first = await send();
  const second = await send();
  const log = await ctx.answerRequest(new Request('http://probe.test/api/log', { headers: { cookie } }));

  expect(await first.json()).toStrictEqual({ duplicate: false });
  expect(await second.json()).toStrictEqual({ duplicate: true });
  expect(await log.json()).toStrictEqual([
    {
      id: expect.any(String),
      at: '2026-10-30T09:00:00.000Z',
      session: expect.stringMatching(/^S-/),
      kind: 'sync',
      detail: {
        messageID: '6f1c2a54-93b7-4c1e-9d4e-2b8f0a7c5e11',
        text: 'buy more tea',
        lastChance: false,
        phoneClockDelayMs: 120_000,
      },
    },
  ]);
});

test('it refuses a synced message without the x-nixie-client header', async () => {
  const ctx = await setupTest();
  const page = await ctx.answerRequest(new Request('http://probe.test/'));
  const cookie = (page.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

  const response = await ctx.answerRequest(
    new Request('http://probe.test/api/sync', {
      method: 'POST',
      headers: { cookie },
      body: JSON.stringify({
        messageID: '6f1c2a54-93b7-4c1e-9d4e-2b8f0a7c5e11',
        text: 'buy more tea',
        queuedAt: Date.UTC(2026, 9, 30, 8, 58, 0),
        lastChance: false,
      }),
    }),
  );

  expect(response.status).toBe(400);
});

test('it refuses a synced message with no session cookie', async () => {
  const ctx = await setupTest();

  const response = await ctx.answerRequest(
    new Request('http://probe.test/api/sync', {
      method: 'POST',
      headers: { 'x-nixie-client': 'probe-sw' },
      body: JSON.stringify({
        messageID: '6f1c2a54-93b7-4c1e-9d4e-2b8f0a7c5e11',
        text: 'buy more tea',
        queuedAt: Date.UTC(2026, 9, 30, 8, 58, 0),
        lastChance: false,
      }),
    }),
  );

  expect(response.status).toBe(401);
});

test('it shows a session only its own log entries', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);
  const otherPage = await ctx.answerRequest(new Request('http://probe.test/'));
  const otherCookie = (otherPage.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

  const own = await ctx.answerRequest(
    new Request('http://probe.test/api/log', { headers: { cookie: phone.cookie } }),
  );
  const other = await ctx.answerRequest(
    new Request('http://probe.test/api/log', { headers: { cookie: otherCookie } }),
  );

  expect(await own.json()).toMatchObject([{ kind: 'subscribed' }]);
  expect(await other.json()).toStrictEqual([]);
});

test('it shows every log entry for the admin key', async () => {
  const ctx = await setupTest();

  await createTestPhone(ctx.answerRequest, ctx.endpoint);
  await createTestPhone(ctx.answerRequest, `${ctx.endpoint}-second`);

  const response = await ctx.answerRequest(
    new Request('http://probe.test/api/log', { headers: { 'x-probe-admin': 'test-admin-key' } }),
  );

  expect(await response.json()).toMatchObject([{ kind: 'subscribed' }, { kind: 'subscribed' }]);
});
