import { expect, mock, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { buildProbeClient } from '../client/build-probe-client.ts';
import { makeProbeHandler } from './make-probe-handler.ts';
import { createTestPhone } from './test-utils/create-test-phone.ts';
import { createTestSession } from './test-utils/create-test-session.ts';

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
  const writeError = mock((_message: string, _error: unknown) => {});
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
    readPublicFile: async (path) => {
      const file = Bun.file(path);

      return (await file.exists()) ? file : null;
    },
    bodyDeadlineMs: 1000,
    writeError,
    now: () => clock.nowMs,
  });
  const admin = buildProbeClient({
    origin: 'http://probe.test',
    headers: { 'x-probe-admin': 'test-admin-key' },
    fetch: answerRequest,
  });

  return {
    answerRequest,
    adminKey: 'test-admin-key',
    admin,
    clock,
    received,
    schedule,
    writeError,
    stopPushService: () => pushService.stop(true),
    endpoint: new URL('/push/phone', pushService.url).href,
  };
}

test('it approves once with the token that the push carried', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);

  await phone.client.push({ approve: true, tag: 'approval' });

  const push = await phone.readPush(ctx.received.mock.calls[0]?.[0] ?? new Uint8Array());

  if (push.approval === null) {
    throw new Error('the push carried no approval');
  }

  expect(await phone.client.approve(push.approval)).toStrictEqual({ approved: true });
});

test('it refuses a second approve with a token already used', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);

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
  const phone = await createTestPhone(ctx, ctx.endpoint);
  const cookies: Record<string, string> = {
    own: phone.cookie,
    other: await createTestSession(ctx),
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
  const phone = await createTestPhone(ctx, ctx.endpoint);

  const response = await ctx.answerRequest(
    new Request('http://probe.test/rpc/log', { method: 'POST', headers: { cookie: phone.cookie } }),
  );

  expect(response.status).toBe(403);
  expect(await response.text()).toBe('the client header is missing');
});

test('it sends a push with the chosen urgency and a VAPID signature', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);

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

test('it passes a failed push send to the error log and answers it as status 0', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);

  ctx.stopPushService();

  const sent = await phone.client.push({});

  expect(sent.statuses).toStrictEqual([0]);
  expect(ctx.writeError.mock.calls).toStrictEqual([['push send failed', expect.any(Error)]]);
});

test('it sends a delayed push only when its scheduled task runs', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);

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

  await createTestPhone(ctx, ctx.endpoint);
  await createTestPhone(ctx, `${ctx.endpoint}-second`);

  expect(await ctx.admin.push({})).toMatchObject({ statuses: [201, 201] });
});

test.each([
  ['neither a session nor the admin key', {}],
  ['a wrong admin key', { 'x-probe-admin': 'test-admin-kez' }],
  ['an empty admin key', { 'x-probe-admin': '' }],
  ['a cookie the server never issued', { cookie: 'probe_session=a-value-the-server-never-issued' }],
])('it refuses a push from a caller with %s', async (_label, headers) => {
  const ctx = await setupTest();

  await createTestPhone(ctx, ctx.endpoint);

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
  const cookies: Record<string, string> = {
    own: await createTestSession(ctx),
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

test('it refuses a subscription to an endpoint that another session holds', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);
  const intruder = buildProbeClient({
    origin: 'http://probe.test',
    headers: { cookie: await createTestSession(ctx) },
    fetch: ctx.answerRequest,
  });

  const taking = intruder.subscribe({
    endpoint: ctx.endpoint,
    keys: { p256dh: 'key', auth: 'secret' },
  });

  expect(taking).rejects.toMatchObject({ status: 409 });
  expect(await phone.client.push({})).toMatchObject({ statuses: [201] });
});

test('it keeps the 5 newest subscriptions of a session and every other session', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);
  const other = await createTestPhone(ctx, `${ctx.endpoint}-other`);

  await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      other.client.subscribe({
        endpoint: `${ctx.endpoint}-other-${index}`,
        keys: { p256dh: 'key', auth: 'secret' },
      }),
    ),
  );

  const listed = await ctx.admin.subscriptions();
  const phoneLabel = (await phone.client.config()).session;

  expect(listed).toHaveLength(6);
  expect(listed.filter((entry) => entry.session === phoneLabel)).toHaveLength(1);
});

test('it records a share with its fields and files and sends the page to block 6', async () => {
  const ctx = await setupTest();
  const cookie = await createTestSession(ctx);
  const form = new FormData();

  form.append('title', 'A shared page');
  form.append('text', 'look at https://example.com/article');
  form.append('files', new File(['fake image bytes'], 'photo.jpg', { type: 'image/jpeg' }));

  const response = await ctx.answerRequest(
    new Request('http://probe.test/share', { method: 'POST', headers: { cookie }, body: form }),
  );
  const location = response.headers.get('location') ?? '';
  const reader = buildProbeClient({
    origin: 'http://probe.test',
    headers: { cookie },
    fetch: ctx.answerRequest,
  });

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
      truncated: [],
      files: [{ name: 'photo.jpg', type: 'image/jpeg', size: 16 }],
      fileCount: 1,
      cookieSent: true,
      sessionKnown: true,
      secFetchSite: null,
    },
  });
});

test('it records a share that arrives without the session cookie for the admin', async () => {
  const ctx = await setupTest();
  const form = new FormData();

  form.append('url', 'https://example.com/page');

  const response = await ctx.answerRequest(
    new Request('http://probe.test/share', { method: 'POST', body: form }),
  );

  expect(
    await ctx.admin.entry({ id: (response.headers.get('location') ?? '').split('share=')[1] ?? '' }),
  ).toMatchObject({
    session: null,
    detail: { url: 'https://example.com/page', cookieSent: false, sessionKnown: false },
  });
});

test.each([
  ['another session', 'other', 404],
  ['no session', 'none', 401],
])('it refuses a log entry to a caller with %s', async (_label, caller, status) => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);
  const form = new FormData();

  form.append('text', 'a private note');

  const response = await ctx.answerRequest(
    new Request('http://probe.test/share', {
      method: 'POST',
      headers: { cookie: phone.cookie },
      body: form,
    }),
  );
  const cookies: Record<string, string> = { other: await createTestSession(ctx), none: '' };
  const reader = buildProbeClient({
    origin: 'http://probe.test',
    headers: { cookie: cookies[caller] ?? '' },
    fetch: ctx.answerRequest,
  });

  expect(
    reader.entry({ id: (response.headers.get('location') ?? '').split('share=')[1] ?? '' }),
  ).rejects.toMatchObject({ status });
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
  const phone = await createTestPhone(ctx, ctx.endpoint);
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

test('it records a message that another session synced first under the same ID', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);
  const other = await createTestPhone(ctx, `${ctx.endpoint}-other`);
  const message = {
    messageID: '6f1c2a54-93b7-4c1e-9d4e-2b8f0a7c5e11',
    text: 'buy more tea',
    queuedAt: Date.UTC(2026, 9, 30, 8, 58, 0),
    lastChance: false,
  };

  await other.client.sync(message);

  expect(await phone.client.sync(message)).toStrictEqual({ duplicate: false });
});

test.each([
  ['no session', 'none', 'buy more tea', 401],
  ['a cookie the server never issued', 'stale', 'buy more tea', 401],
  ['a text over 2000 characters', 'own', 'a'.repeat(2001), 400],
])('it refuses a synced message with %s', async (_label, caller, text, status) => {
  const ctx = await setupTest();
  const cookies: Record<string, string> = {
    own: await createTestSession(ctx),
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
  const phone = await createTestPhone(ctx, ctx.endpoint);
  const otherPhone = await createTestPhone(ctx, `${ctx.endpoint}-second`);

  const own = await phone.client.log();

  expect(own).toMatchObject([{ kind: 'subscribed', detail: { pushService: expect.any(String) } }]);
  expect(own[0]?.session).not.toBe((await otherPhone.client.log())[0]?.session);
});

test('it shows every log entry, newest first, for the admin key', async () => {
  const ctx = await setupTest();

  await createTestPhone(ctx, ctx.endpoint);
  await createTestPhone(ctx, `${ctx.endpoint}-second`);
  await ctx.answerRequest(
    new Request('http://probe.test/share', { method: 'POST', body: new FormData() }),
  );

  expect(await ctx.admin.log()).toMatchObject([
    { kind: 'share', session: null },
    { kind: 'subscribed' },
    { kind: 'subscribed' },
  ]);
});

test('it keeps a phone log entry through a flood of anonymous shares and approve calls', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);
  const anonymous = buildProbeClient({ origin: 'http://probe.test', fetch: ctx.answerRequest });

  for (let index = 0; index < 150; index += 1) {
    await ctx.answerRequest(
      new Request('http://probe.test/share', { method: 'POST', body: new FormData() }),
    );
    await anonymous
      .approve({ approvalID: crypto.randomUUID(), token: 'guessed-token' })
      .catch(() => null);
  }

  expect(await phone.client.log()).toMatchObject([{ kind: 'subscribed' }]);
  expect(await ctx.admin.log()).toHaveLength(101);
});

test.each([
  ['neither a session nor the admin key', {}],
  ['a wrong admin key', { 'x-probe-admin': 'test-admin-kez' }],
  ['a cookie the server never issued', { cookie: 'probe_session=a-value-the-server-never-issued' }],
])('it refuses the log to a caller with %s', async (_label, headers) => {
  const ctx = await setupTest();

  await createTestPhone(ctx, ctx.endpoint);

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
  const phone = await createTestPhone(ctx, ctx.endpoint);

  expect(phone.client.subscriptions()).rejects.toMatchObject({ status: 401 });
});

test('it forgets a session that signs out, with its subscriptions, and clears its cookie', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);

  const response = await ctx.answerRequest(
    new Request('http://probe.test/rpc/signOut', {
      method: 'POST',
      headers: { cookie: phone.cookie, 'x-nixie-client': 'probe' },
    }),
  );

  expect(response.headers.get('set-cookie')).toStartWith('probe_session=; Path=/; Max-Age=0;');
  expect(phone.client.log()).rejects.toMatchObject({ status: 401 });
  expect(await ctx.admin.subscriptions()).toStrictEqual([]);
});

test('it pairs with a code from the admin and sets a cookie only scripts on the same site send', async () => {
  const ctx = await setupTest();
  const { code } = await ctx.admin.createPairing();

  const response = await ctx.answerRequest(
    new Request('http://probe.test/rpc/pair', {
      method: 'POST',
      headers: { 'x-nixie-client': 'probe', 'content-type': 'application/json' },
      body: JSON.stringify({ json: { code: ` ${code.slice(0, 5).toUpperCase()}-${code.slice(5)} ` } }),
    }),
  );

  expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).toMatch(
    /^probe_session=[\w-]{43}; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/,
  );
});

test('it makes a pairing code of 10 characters that expires in 10 minutes', async () => {
  const ctx = await setupTest();

  expect(await ctx.admin.createPairing()).toStrictEqual({
    code: expect.stringMatching(/^[0-9a-hjkmnp-tv-z]{10}$/),
    expiresAt: '2026-10-30T09:10:00.000Z',
  });
});

test('it refuses a pairing code to a caller without the admin key', async () => {
  const ctx = await setupTest();
  const anonymous = buildProbeClient({ origin: 'http://probe.test', fetch: ctx.answerRequest });

  expect(anonymous.createPairing()).rejects.toMatchObject({ status: 401 });
});

test('it refuses a pairing while no code waits', async () => {
  const ctx = await setupTest();
  const anonymous = buildProbeClient({ origin: 'http://probe.test', fetch: ctx.answerRequest });

  expect(anonymous.pair({ code: 'abcdefghjk' })).rejects.toMatchObject({
    status: 403,
    message: 'no pairing code waiting',
  });
});

test('it refuses a pairing with a wrong code', async () => {
  const ctx = await setupTest();
  const anonymous = buildProbeClient({ origin: 'http://probe.test', fetch: ctx.answerRequest });

  await ctx.admin.createPairing();

  expect(anonymous.pair({ code: 'abcdefghjk' })).rejects.toMatchObject({
    status: 403,
    message: 'wrong pairing code',
  });
});

test('it refuses a pairing with a code past 10 minutes', async () => {
  const ctx = await setupTest();
  const anonymous = buildProbeClient({ origin: 'http://probe.test', fetch: ctx.answerRequest });
  const { code } = await ctx.admin.createPairing();

  ctx.clock.nowMs += 10 * 60 * 1000 + 1;

  expect(anonymous.pair({ code })).rejects.toMatchObject({
    status: 403,
    message: 'no pairing code waiting',
  });
});

test('it refuses a pairing code that a phone already used', async () => {
  const ctx = await setupTest();
  const { code } = await ctx.admin.createPairing();
  const first = buildProbeClient({ origin: 'http://probe.test', fetch: ctx.answerRequest });
  const second = buildProbeClient({ origin: 'http://probe.test', fetch: ctx.answerRequest });

  await first.pair({ code });

  expect(second.pair({ code })).rejects.toMatchObject({
    status: 403,
    message: 'no pairing code waiting',
  });
});

test('it drops a pairing code after 5 wrong tries', async () => {
  const ctx = await setupTest();
  const { code } = await ctx.admin.createPairing();
  const anonymous = buildProbeClient({ origin: 'http://probe.test', fetch: ctx.answerRequest });

  for (let index = 0; index < 5; index += 1) {
    await anonymous.pair({ code: `wrong${index}` }).catch(() => null);
  }

  expect(anonymous.pair({ code })).rejects.toMatchObject({
    status: 403,
    message: 'no pairing code waiting',
  });
});

test('it refuses a pairing past 20 sessions and keeps every paired phone', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);

  for (let index = 0; index < 19; index += 1) {
    await createTestSession(ctx);
  }

  const { code } = await ctx.admin.createPairing();
  const anonymous = buildProbeClient({ origin: 'http://probe.test', fetch: ctx.answerRequest });

  expect(anonymous.pair({ code })).rejects.toMatchObject({ status: 409 });
  expect((await phone.client.config()).session).toStartWith('S-');
});

test('it replaces the session of a phone that pairs again', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);
  const { code } = await ctx.admin.createPairing();

  await phone.client.pair({ code });

  expect((await phone.client.config()).session).toBeNull();
});

test('it starts no session for a flood of page requests, and a paired phone keeps working', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);

  const pages = await Promise.all(
    Array.from({ length: 2000 }, () => ctx.answerRequest(new Request('http://probe.test/'))),
  );

  expect(pages.filter((page) => page.headers.has('set-cookie'))).toStrictEqual([]);
  expect(await phone.client.push({})).toMatchObject({ statuses: [201] });
  expect((await phone.client.config()).session).toStartWith('S-');
});

test('it serves the bundled service worker from the root', async () => {
  const ctx = await setupTest();

  const response = await ctx.answerRequest(new Request('http://probe.test/sw.js'));

  expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
  expect(await response.text()).toBe('// worker');
});

test('it answers a missing public file as not found', async () => {
  const ctx = await setupTest();

  const response = await ctx.answerRequest(new Request('http://probe.test/missing.html'));

  expect(response.status).toBe(404);
});

test('it refuses a streamed share over 25 MiB and logs nothing', async () => {
  const ctx = await setupTest();
  const chunk = new Uint8Array(1024 * 1024);

  const response = await ctx.answerRequest(
    new Request('http://probe.test/share', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=probe' },
      body: new ReadableStream<Uint8Array>({ pull: (controller) => controller.enqueue(chunk) }),
    }),
  );

  expect(response.status).toBe(413);
  expect(await ctx.admin.log()).toStrictEqual([]);
});

test('it refuses a share that declares a length over 25 MiB', async () => {
  const ctx = await setupTest();

  const response = await ctx.answerRequest(
    new Request('http://probe.test/share', {
      method: 'POST',
      headers: { 'content-length': String(25 * 1024 * 1024 + 1) },
      body: 'a short body',
    }),
  );

  expect(response.status).toBe(413);
});

test('it refuses a share whose body still arrives at the deadline', async () => {
  const ctx = await setupTest();

  const response = await ctx.answerRequest(
    new Request('http://probe.test/share', {
      method: 'POST',
      body: new ReadableStream<Uint8Array>({
        start: (controller) => controller.enqueue(new Uint8Array(10)),
      }),
    }),
  );

  expect(response.status).toBe(408);
});

test('it keeps at most 2000 characters of a shared field and 20 shared files', async () => {
  const ctx = await setupTest();
  const form = new FormData();

  form.append('text', 'x'.repeat(5000));
  form.append('title', 'short');

  await Promise.all(
    Array.from({ length: 25 }, (_, index) =>
      form.append('files', new File(['bytes'], `photo-${index}.jpg`, { type: 'image/jpeg' })),
    ),
  );

  const response = await ctx.answerRequest(
    new Request('http://probe.test/share', { method: 'POST', body: form }),
  );
  const entry = await ctx.admin.entry({
    id: (response.headers.get('location') ?? '').split('share=')[1] ?? '',
  });

  expect(entry.detail).toMatchObject({
    text: 'x'.repeat(2000),
    title: 'short',
    truncated: ['text'],
    fileCount: 25,
  });
  expect(entry.detail['files']).toHaveLength(20);
});

test('it keeps at most 100 characters of a header the log copies', async () => {
  const ctx = await setupTest();

  const response = await ctx.answerRequest(
    new Request('http://probe.test/share', {
      method: 'POST',
      headers: { 'sec-fetch-site': 's'.repeat(4000) },
      body: new FormData(),
    }),
  );
  const entry = await ctx.admin.entry({
    id: (response.headers.get('location') ?? '').split('share=')[1] ?? '',
  });

  expect(entry.detail['secFetchSite']).toBe('s'.repeat(100));
});

test('it refuses a third share without a session while 2 are still arriving', async () => {
  const ctx = await setupTest();
  const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
  const startShare = () =>
    ctx.answerRequest(
      new Request('http://probe.test/share', {
        method: 'POST',
        body: new ReadableStream<Uint8Array>({ start: (controller) => void controllers.push(controller) }),
      }),
    );

  onTestFinished(() => controllers.forEach((controller) => controller.close()));

  void startShare();
  void startShare();

  const third = await ctx.answerRequest(
    new Request('http://probe.test/share', { method: 'POST', body: new FormData() }),
  );

  expect(third.status).toBe(503);
});

test('it records a share from a paired phone while 2 shares without a session are arriving', async () => {
  const ctx = await setupTest();
  const cookie = await createTestSession(ctx);
  const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
  const startShare = () =>
    ctx.answerRequest(
      new Request('http://probe.test/share', {
        method: 'POST',
        body: new ReadableStream<Uint8Array>({ start: (controller) => void controllers.push(controller) }),
      }),
    );

  onTestFinished(() => controllers.forEach((controller) => controller.close()));

  void startShare();
  void startShare();

  const phoneShare = await ctx.answerRequest(
    new Request('http://probe.test/share', {
      method: 'POST',
      headers: { cookie },
      body: new FormData(),
    }),
  );

  expect(phoneShare.status).toBe(303);
});

test('it refuses an API call over 64 KiB before it parses it', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);

  const response = await ctx.answerRequest(
    new Request('http://probe.test/rpc/sync', {
      method: 'POST',
      headers: { cookie: phone.cookie, 'x-nixie-client': 'probe', 'content-type': 'application/json' },
      body: JSON.stringify({ json: { text: 'x'.repeat(70 * 1024) } }),
    }),
  );

  expect(response.status).toBe(413);
});

test('it refuses an API call whose body stream fails after a whole call and runs nothing', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);
  const call = JSON.stringify({
    json: {
      messageID: '6f1c2a54-93b7-4c1e-9d4e-2b8f0a7c5e11',
      text: 'buy more tea',
      queuedAt: Date.UTC(2026, 9, 30, 8, 58, 0),
      lastChance: false,
    },
  });

  const response = await ctx.answerRequest(
    new Request('http://probe.test/rpc/sync', {
      method: 'POST',
      headers: { cookie: phone.cookie, 'x-nixie-client': 'probe', 'content-type': 'application/json' },
      body: new ReadableStream<Uint8Array>({
        start: (controller) => controller.enqueue(new TextEncoder().encode(call)),
        pull: (controller) => controller.error(new Error('connection reset')),
      }),
    }),
  );

  expect(response.status).toBe(400);
  expect(await response.text()).toBe('the call broke off');
  expect((await phone.client.log()).filter((entry) => entry.kind === 'sync')).toStrictEqual([]);
});

test('it logs one receipt for a push that a phone reports twice', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);
  const sent = await phone.client.push({});

  const first = await phone.client.pushReceived({ pushID: sent.pushID, receivedAt: 1_000 });
  const second = await phone.client.pushReceived({ pushID: sent.pushID, receivedAt: 1_000 });

  expect(first).toStrictEqual({ recorded: true, duplicate: false });
  expect(second).toStrictEqual({ recorded: true, duplicate: true });
  expect((await phone.client.log()).filter((entry) => entry.kind === 'push-received')).toHaveLength(
    1,
  );
});

test.each([
  ['another session', 'other', 404],
  ['no session', 'none', 401],
])('it refuses a receipt for a push from a caller with %s', async (_label, caller, status) => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);
  const sent = await phone.client.push({});
  const cookies: Record<string, string> = { other: await createTestSession(ctx), none: '' };
  const reporter = buildProbeClient({
    origin: 'http://probe.test',
    headers: { cookie: cookies[caller] ?? '' },
    fetch: ctx.answerRequest,
  });

  expect(reporter.pushReceived({ pushID: sent.pushID, receivedAt: 1_000 })).rejects.toMatchObject({
    status,
  });
});

test('it refuses a push past 10 in progress for one session', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);

  await Promise.all(Array.from({ length: 10 }, () => phone.client.push({ delaySeconds: 60 })));

  expect(phone.client.push({ delaySeconds: 60 })).rejects.toMatchObject({ status: 429 });
});

test('it takes a push from the admin while a session has 10 in progress', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);

  await Promise.all(Array.from({ length: 10 }, () => phone.client.push({ delaySeconds: 60 })));

  expect(await ctx.admin.push({ delaySeconds: 60 })).toMatchObject({ statuses: null });
});

test('it frees a push slot once a delayed push is sent', async () => {
  const ctx = await setupTest();
  const phone = await createTestPhone(ctx, ctx.endpoint);

  await Promise.all(Array.from({ length: 10 }, () => phone.client.push({ delaySeconds: 60 })));
  await ctx.schedule.mock.calls[0]?.[1]();

  expect(await phone.client.push({ delaySeconds: 60 })).toMatchObject({ statuses: null });
});
