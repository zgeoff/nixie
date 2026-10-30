import { expect, mock, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { buildProbeClient } from '../client/build-probe-client.ts';
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
  const schedule = mock((_delayMs: number, _task: () => Promise<void>) => {});
  const answerRequest = makeProbeHandler({
    vapidKeys: {
      privateKey: vapidPair.privateKey,
      publicKey: Buffer.from(await crypto.subtle.exportKey('raw', vapidPair.publicKey)).toString(
        'base64url',
      ),
    },
    adminKey: 'test-admin-key',
    publicDirectory: join(import.meta.dir, '..', 'public'),
    clientAssets: new Map([['sw.js', new Blob(['// worker'])]]),
    isPushEndpointAllowed: (endpoint) => endpoint.origin === pushService.url.origin,
    pushTransport: (url, init) => fetch(url, init),
    schedule,
    now: () => clock.nowMs,
  });

  return {
    answerRequest,
    clock,
    received,
    schedule,
    endpoint: new URL('/push/phone', pushService.url).href,
  };
}

test('it approves once with the token that the push carried', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);

  await phone.client.push({ approve: true, tag: 'approval' });

  const push = await phone.readPush(ctx.received.mock.calls[0]?.[0] ?? new Uint8Array());

  if (push.approval === null) {
    throw new Error('the push carried no approval');
  }

  expect(await phone.client.approve(push.approval)).toStrictEqual({ approved: true });
});

test('it refuses a second approve with a token already used', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);

  await phone.client.push({ approve: true });

  const push = await phone.readPush(ctx.received.mock.calls[0]?.[0] ?? new Uint8Array());

  if (push.approval === null) {
    throw new Error('the push carried no approval');
  }

  await phone.client.approve(push.approval);

  expect(phone.client.approve(push.approval)).rejects.toMatchObject({
    status: 409,
    message: 'token already used',
  });
});

test.each([
  ['a wrong token', 'own', 'guessed', 0, 403, 'wrong token'],
  ['another session', 'other', 'issued', 0, 403, 'another session'],
  ['no session cookie', 'none', 'issued', 0, 401, 'no session'],
  ['a cookie the server never issued', 'stale', 'issued', 0, 401, 'no session'],
  ['a token past 15 minutes', 'own', 'issued', 15 * 60 * 1000 + 1, 410, 'token expired'],
])('it refuses an approve with %s', async (_label, caller, token, laterMs, status, message) => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);
  const otherPage = await ctx.answerRequest(new Request('http://probe.test/'));
  const cookies: Record<string, string> = {
    own: phone.cookie,
    other: (otherPage.headers.get('set-cookie') ?? '').split(';')[0] ?? '',
    none: '',
    stale: 'probe_session=a-value-the-server-never-issued',
  };

  await phone.client.push({ approve: true });

  const push = await phone.readPush(ctx.received.mock.calls[0]?.[0] ?? new Uint8Array());

  if (push.approval === null) {
    throw new Error('the push carried no approval');
  }

  const tokens: Record<string, string> = { issued: push.approval.token, guessed: 'guessed-token' };
  const callerClient = buildProbeClient({
    origin: 'http://probe.test',
    headers: { cookie: cookies[caller] ?? '' },
    fetch: ctx.answerRequest,
  });

  ctx.clock.nowMs += laterMs;

  expect(
    callerClient.approve({ approvalID: push.approval.approvalID, token: tokens[token] ?? '' }),
  ).rejects.toMatchObject({ status, message });
});

test('it refuses every API call without the x-nixie-client header', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);

  const response = await ctx.answerRequest(
    new Request('http://probe.test/rpc/log', { method: 'POST', headers: { cookie: phone.cookie } }),
  );

  expect(response.status).toBe(403);
  expect(await response.text()).toBe('the client header is missing');
});

test('it sends a push with the chosen urgency and a VAPID signature', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);

  const sent = await phone.client.push({
    urgency: 'high',
    tag: 'doze',
    silent: true,
    renotify: true,
  });

  const headers = ctx.received.mock.calls[0]?.[1];

  expect(sent).toStrictEqual({ pushID: expect.any(String), delaySeconds: 0, statuses: [201] });
  expect(headers?.get('urgency')).toBe('high');
  expect(headers?.get('content-encoding')).toBe('aes128gcm');
  expect(headers?.get('authorization')).toStartWith('vapid t=');
  expect(await phone.readPush(ctx.received.mock.calls[0]?.[0] ?? new Uint8Array())).toStrictEqual({
    pushID: sent.pushID,
    sentAt: Date.UTC(2026, 9, 30, 9, 0, 0),
    title: 'nixie probe',
    tag: 'doze',
    silent: true,
    renotify: true,
    urgency: 'high',
    approval: null,
  });
});

test('it sends a delayed push only when its scheduled task runs', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);

  const sent = await phone.client.push({ delaySeconds: 15 });
  const sentBeforeTask = ctx.received.mock.calls.length;

  await ctx.schedule.mock.calls[0]?.[1]();

  expect(sent).toStrictEqual({ pushID: expect.any(String), delaySeconds: 15, statuses: null });
  expect(ctx.schedule.mock.calls).toStrictEqual([[15_000, expect.any(Function)]]);
  expect(sentBeforeTask).toBe(0);
  expect(ctx.received).toHaveBeenCalledTimes(1);
});

test('it sends to every subscribed phone for the admin key', async () => {
  const ctx = await setupTest();

  await createTestPhone(ctx.answerRequest, ctx.endpoint);
  await createTestPhone(ctx.answerRequest, `${ctx.endpoint}-second`);

  const admin = buildProbeClient({
    origin: 'http://probe.test',
    headers: { 'x-probe-admin': 'test-admin-key' },
    fetch: ctx.answerRequest,
  });

  expect(await admin.push({})).toMatchObject({ statuses: [201, 201] });
});

test.each([
  ['neither a session nor the admin key', {}],
  ['a wrong admin key', { 'x-probe-admin': 'test-admin-kez' }],
  ['an empty admin key', { 'x-probe-admin': '' }],
  ['a cookie the server never issued', { cookie: 'probe_session=a-value-the-server-never-issued' }],
])('it refuses a push from a caller with %s', async (_label, headers) => {
  const ctx = await setupTest();

  await createTestPhone(ctx.answerRequest, ctx.endpoint);

  const caller = buildProbeClient({ origin: 'http://probe.test', headers, fetch: ctx.answerRequest });

  expect(caller.push({})).rejects.toMatchObject({ status: 401 });
  expect(ctx.received).not.toHaveBeenCalled();
});

test.each([
  ['a host that is no push service', 'https://attacker.example/push', 'own', 400],
  ['no session', 'https://fcm.googleapis.com/fcm/send/abc', 'none', 401],
  ['a cookie the server never issued', 'https://fcm.googleapis.com/fcm/send/abc', 'stale', 401],
  ['an endpoint that is no URL', 'not a url', 'own', 400],
])('it refuses a subscription with %s', async (_label, endpoint, caller, status) => {
  const ctx = await setupTest();
  const page = await ctx.answerRequest(new Request('http://probe.test/'));
  const cookies: Record<string, string> = {
    own: (page.headers.get('set-cookie') ?? '').split(';')[0] ?? '',
    none: '',
    stale: 'probe_session=a-value-the-server-never-issued',
  };
  const client = buildProbeClient({
    origin: 'http://probe.test',
    headers: { cookie: cookies[caller] ?? '' },
    fetch: ctx.answerRequest,
  });

  expect(
    client.subscribe({
      endpoint,
      keys: { p256dh: 'key', auth: 'secret' },
    }),
  ).rejects.toMatchObject({ status });
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
  const reader = buildProbeClient({ origin: 'http://probe.test', fetch: ctx.answerRequest });

  expect(response.status).toBe(303);
  expect(location).toStartWith('/block-6.html?share=');
  expect(await reader.entry({ id: location.split('share=')[1] ?? '' })).toStrictEqual({
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
  const reader = buildProbeClient({ origin: 'http://probe.test', fetch: ctx.answerRequest });

  expect(
    await reader.entry({ id: (response.headers.get('location') ?? '').split('share=')[1] ?? '' }),
  ).toMatchObject({
    session: null,
    detail: { url: 'https://example.com/page', cookieSent: false, sessionKnown: false },
  });
});

test('it refuses a share that is no form', async () => {
  const ctx = await setupTest();

  const response = await ctx.answerRequest(
    new Request('http://probe.test/share', { method: 'POST', body: '{"text":"hello"}' }),
  );

  expect(response.status).toBe(400);
});

test('it records a synced message once and answers a repeat as a duplicate', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);
  const message = {
    messageID: '6f1c2a54-93b7-4c1e-9d4e-2b8f0a7c5e11',
    text: 'buy more tea',
    queuedAt: Date.UTC(2026, 9, 30, 8, 58, 0),
    lastChance: false,
  };

  const first = await phone.client.sync(message);
  const second = await phone.client.sync(message);

  expect(first).toStrictEqual({ duplicate: false });
  expect(second).toStrictEqual({ duplicate: true });
  expect((await phone.client.log()).filter((entry) => entry.kind === 'sync')).toStrictEqual([
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

test.each([
  ['no session', 'none', 'buy more tea', 401],
  ['a cookie the server never issued', 'stale', 'buy more tea', 401],
  ['a text over 2000 characters', 'own', 'a'.repeat(2001), 400],
])('it refuses a synced message with %s', async (_label, caller, text, status) => {
  const ctx = await setupTest();
  const page = await ctx.answerRequest(new Request('http://probe.test/'));
  const cookies: Record<string, string> = {
    own: (page.headers.get('set-cookie') ?? '').split(';')[0] ?? '',
    none: '',
    stale: 'probe_session=a-value-the-server-never-issued',
  };
  const client = buildProbeClient({
    origin: 'http://probe.test',
    headers: { cookie: cookies[caller] ?? '' },
    fetch: ctx.answerRequest,
  });

  expect(
    client.sync({
      messageID: '6f1c2a54-93b7-4c1e-9d4e-2b8f0a7c5e11',
      text,
      queuedAt: Date.UTC(2026, 9, 30, 8, 58, 0),
      lastChance: false,
    }),
  ).rejects.toMatchObject({ status });
});

test('it shows a session only its own log entries', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);
  const otherPhone = await createTestPhone(ctx.answerRequest, `${ctx.endpoint}-second`);

  const own = await phone.client.log();

  expect(own).toMatchObject([{ kind: 'subscribed', detail: { pushService: expect.any(String) } }]);
  expect(own[0]?.session).not.toBe((await otherPhone.client.log())[0]?.session);
});

test('it shows every log entry for the admin key', async () => {
  const ctx = await setupTest();

  await createTestPhone(ctx.answerRequest, ctx.endpoint);
  await createTestPhone(ctx.answerRequest, `${ctx.endpoint}-second`);

  const admin = buildProbeClient({
    origin: 'http://probe.test',
    headers: { 'x-probe-admin': 'test-admin-key' },
    fetch: ctx.answerRequest,
  });

  expect(await admin.log()).toMatchObject([{ kind: 'subscribed' }, { kind: 'subscribed' }]);
});

test.each([
  ['neither a session nor the admin key', {}],
  ['a wrong admin key', { 'x-probe-admin': 'test-admin-kez' }],
  ['a cookie the server never issued', { cookie: 'probe_session=a-value-the-server-never-issued' }],
])('it refuses the log to a caller with %s', async (_label, headers) => {
  const ctx = await setupTest();

  await createTestPhone(ctx.answerRequest, ctx.endpoint);

  const caller = buildProbeClient({ origin: 'http://probe.test', headers, fetch: ctx.answerRequest });

  expect(caller.log()).rejects.toMatchObject({ status: 401 });
});

test.each([
  ['no key', {}],
  ['a wrong admin key', { 'x-probe-admin': 'test-admin-kez' }],
])('it refuses the subscription list to a caller with %s', async (_label, headers) => {
  const ctx = await setupTest();
  const caller = buildProbeClient({ origin: 'http://probe.test', headers, fetch: ctx.answerRequest });

  expect(caller.subscriptions()).rejects.toMatchObject({ status: 401 });
});

test('it refuses the subscription list to a phone with only its session', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);

  expect(phone.client.subscriptions()).rejects.toMatchObject({ status: 401 });
});

test('it forgets a session that signs out and clears its cookie', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx.answerRequest, ctx.endpoint);

  const response = await ctx.answerRequest(
    new Request('http://probe.test/rpc/signOut', {
      method: 'POST',
      headers: { cookie: phone.cookie, 'x-nixie-client': 'probe' },
    }),
  );

  expect(response.headers.get('set-cookie')).toStartWith('probe_session=; Path=/; Max-Age=0;');
  expect(phone.client.log()).rejects.toMatchObject({ status: 401 });
});

test('it starts a session on a page with a cookie only scripts on the same site send', async () => {
  const ctx = await setupTest();

  const response = await ctx.answerRequest(new Request('http://probe.test/block-1.html'));

  expect(response.headers.get('set-cookie')).toMatch(
    /^probe_session=[\w-]{43}; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/,
  );
});

test('it serves the bundled service worker from the root', async () => {
  const ctx = await setupTest();

  const response = await ctx.answerRequest(new Request('http://probe.test/sw.js'));

  expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
  expect(await response.text()).toBe('// worker');
});
