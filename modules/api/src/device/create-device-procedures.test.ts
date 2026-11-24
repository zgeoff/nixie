import { expect, test } from 'bun:test';
import { seedImage } from '@heynixie/connectors/test-utils';
import { clientHeaderName, contract, sessionCookieName } from '@heynixie/contract';
import { readDeviceByIdentity } from '@heynixie/devices';
import { makeDeviceToolCaller } from '@heynixie/devices/test-utils';
import { createConversationTask } from '@heynixie/tasks';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { buildTestClient } from '../test-utils/build-test-client';
import { collectContractPaths } from '../test-utils/collect-contract-paths';
import { createDeviceSession } from '../test-utils/create-device-session';
import { followTestDevice } from '../test-utils/follow-test-device';
import { startTestAPI } from '../test-utils/start-test-api';
import type { APITables } from '../types';
import { defaultAPISettings } from '../utils/default-api-settings';
import { readSessions } from '../utils/read-sessions';

type Client = ReturnType<typeof buildTestClient>;

async function setupTest() {
  const api = await startTestAPI({ ...defaultAPISettings, lastSeenIntervalMs: 50 });
  const owner = await createDeviceSession(api.context, 'laptop');

  const ownerClient = buildTestClient(api.url, owner.token);

  const enrol = async (scope: 'full' | 'device', name: string) => {
    const issued = await ownerClient.sessions.issueCode({
      clientActionID: crypto.randomUUID(),
      scope,
    });

    const enrolled = await buildTestClient(api.url).sessions.enrol({
      clientActionID: crypto.randomUUID(),
      code: issued.code,
      deviceName: name,
      tokenDelivery: 'bearer',
    });

    invariant(enrolled.token !== undefined, 'a bearer enrolment returns its token');

    return { ...enrolled, client: buildTestClient(api.url, enrolled.token), token: enrolled.token };
  };

  return {
    ...api,
    ownerClient,
    enrol,
    call: makeDeviceToolCaller({
      log: api.context.log,
      definitions: api.context.definitions,
      clock: api.context.clock,
      streams: api.context.clients.devices,
    }),
    readSessionCount: async () => {
      const sessions = await readSessions(api.context, null);

      return sessions.length;
    },
    readDevice: (sessionID: string) => readDeviceByIdentity(api.writer.db, sessionID),
    readLastSeen: async (sessionID: string) => {
      const identity = await api.writer.db
        .$extendTables<APITables>()
        .selectFrom('identities')
        .select('last_seen_at')
        .where('identity_id', '=', sessionID)
        .executeTakeFirstOrThrow();

      return identity.last_seen_at;
    },
    callPath: async (path: string, token: string) => {
      try {
        return await fetch(`${api.url}${path}`, {
          method: 'POST',
          headers: {
            [clientHeaderName]: 'test',
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: '{}',
          signal: AbortSignal.timeout(1000),
        });
      } catch {
        return null;
      }
    },
  };
}

test('it enrols a device session with a device named for it and its screen off', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');
  const row = await ctx.readDevice(device.sessionID);

  expect([device.scope, row]).toStrictEqual([
    'device',
    {
      deviceID: expect.toBeString(),
      identityID: device.sessionID,
      name: 'desk panel',
      capabilities: { screen: false, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
  ]);
});

test('it enrols a full session from a full code, with no device', async () => {
  const ctx = await setupTest();
  const session = await ctx.enrol('full', 'phone');
  const row = await ctx.readDevice(session.sessionID);

  expect([session.scope, row]).toStrictEqual(['full', null]);
});

test('it tells a full session with no device row to register before it follows', async () => {
  const ctx = await setupTest();
  const session = await ctx.enrol('full', 'phone');

  const refused = followTestDevice(session.client, { pixels: { width: 800, height: 600 } });

  expect(refused).rejects.toMatchObject({ code: 'NOT_A_DEVICE' });
});

test.each([
  [
    'setCapability',
    (client: Client) => client.devices.setCapability({ capability: 'screen', isOn: true }),
  ],
  ['readImage', (client: Client) => client.devices.readImage({ image: 'k3x9m2p7qa' })],
  ['resize', (client: Client) => client.devices.resize({ width: 800, height: 600 })],
])('it tells a full session with no device row to register before %s', async (_name, call) => {
  const ctx = await setupTest();
  const session = await ctx.enrol('full', 'phone');

  expect(call(session.client)).rejects.toMatchObject({ code: 'NOT_A_DEVICE' });
});

test('it registers a device for a full session with every capability off', async () => {
  const ctx = await setupTest();
  const session = await ctx.enrol('full', 'phone');

  const registered = await session.client.devices.register({
    clientActionID: crypto.randomUUID(),
    name: 'kitchen tab',
  });

  const row = await ctx.readDevice(session.sessionID);

  expect([registered, row]).toStrictEqual([
    { deviceID: expect.toBeString() },
    {
      deviceID: registered.deviceID,
      identityID: session.sessionID,
      name: 'kitchen tab',
      capabilities: { screen: false, camera: false, speaker: false, microphone: false },
      shownSequence: null,
      idleSequence: null,
    },
  ]);
});

test('it renames the device row of a full session on a second register', async () => {
  const ctx = await setupTest();
  const session = await ctx.enrol('full', 'phone');

  const first = await session.client.devices.register({
    clientActionID: crypto.randomUUID(),
    name: 'kitchen tab',
  });

  const second = await session.client.devices.register({
    clientActionID: crypto.randomUUID(),
    name: 'hall tab',
  });

  const row = await ctx.readDevice(session.sessionID);

  expect([second, row?.deviceID, row?.name]).toStrictEqual([first, first.deviceID, 'hall tab']);
});

test('it answers a retry of a register with the same device', async () => {
  const ctx = await setupTest();
  const session = await ctx.enrol('full', 'phone');

  const clientActionID = crypto.randomUUID();

  const first = await session.client.devices.register({ clientActionID, name: 'kitchen tab' });
  const second = await session.client.devices.register({ clientActionID, name: 'kitchen tab' });

  expect(second).toStrictEqual(first);
});

test('it refuses a register that reuses the client action ID of another action', async () => {
  const ctx = await setupTest();
  const session = await ctx.enrol('full', 'phone');

  const clientActionID = crypto.randomUUID();

  await session.client.sessions.issueCode({ clientActionID });

  const refused = session.client.devices.register({ clientActionID, name: 'kitchen tab' });

  expect(refused).rejects.toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
});

test('it refuses a register that reuses the client action ID with another name', async () => {
  const ctx = await setupTest();
  const session = await ctx.enrol('full', 'phone');

  const clientActionID = crypto.randomUUID();

  await session.client.devices.register({ clientActionID, name: 'kitchen tab' });

  const refused = session.client.devices.register({ clientActionID, name: 'hall tab' });

  expect(refused).rejects.toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
});

test('it keeps the chat of a full session that holds a device row', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const session = await ctx.enrol('full', 'phone');

  await session.client.devices.register({
    clientActionID: crypto.randomUUID(),
    name: 'kitchen tab',
  });

  const sent = await session.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    thread: 'conversation',
    text: 'hello',
    spans: [{ start: 0, end: 5, source: 'typed' as const }],
  });

  expect(sent).toStrictEqual({ duplicate: false, sequence: expect.toBeNumber() });
});

test('it updates the size that devices.list reads when a full session resizes', async () => {
  const ctx = await setupTest();
  const session = await ctx.enrol('full', 'phone');

  await session.client.devices.register({
    clientActionID: crypto.randomUUID(),
    name: 'kitchen tab',
  });

  const stopped = new AbortController();

  const events = await followTestDevice(
    session.client,
    { pixels: { width: 800, height: 600 } },
    { signal: stopped.signal },
  );

  await events.next();
  await session.client.devices.resize({ width: 1024, height: 768, pixelRatio: 2 });

  const listed = await ctx.call('devices.list', {});

  stopped.abort();

  expect(listed).toStrictEqual({
    status: 'ok',
    result: {
      devices: [
        expect.objectContaining({
          online: true,
          pixels: { width: 1024, height: 768, pixelRatio: 2 },
        }),
      ],
    },
  });
});

test('it resizes only the open streams of the session that resizes when 2 devices follow', async () => {
  const ctx = await setupTest();
  const panel = await ctx.enrol('device', 'desk panel');
  const session = await ctx.enrol('full', 'phone');

  await session.client.devices.register({
    clientActionID: crypto.randomUUID(),
    name: 'kitchen tab',
  });

  const stopped = new AbortController();

  const panelEvents = await followTestDevice(
    panel.client,
    { pixels: { width: 640, height: 480 } },
    { signal: stopped.signal },
  );

  const sessionEvents = await followTestDevice(
    session.client,
    { pixels: { width: 800, height: 600 } },
    { signal: stopped.signal },
  );

  await panelEvents.next();
  await sessionEvents.next();
  await session.client.devices.resize({ width: 1024, height: 768 });

  const listed = await ctx.call('devices.list', {});

  stopped.abort();

  expect(listed).toStrictEqual({
    status: 'ok',
    result: {
      devices: expect.toIncludeSameMembers([
        expect.objectContaining({
          name: 'desk panel',
          pixels: { width: 640, height: 480, pixelRatio: 1 },
        }),
        expect.objectContaining({
          name: 'kitchen tab',
          pixels: { width: 1024, height: 768, pixelRatio: 1 },
        }),
      ]),
    },
  });
});

test('it acts on the own row of a full session when another session holds a row too', async () => {
  const ctx = await setupTest();
  const panel = await ctx.enrol('device', 'desk panel');
  const session = await ctx.enrol('full', 'phone');

  const registered = await session.client.devices.register({
    clientActionID: crypto.randomUUID(),
    name: 'kitchen tab',
  });

  await session.client.devices.setCapability({ capability: 'screen', isOn: true });

  const own = await ctx.readDevice(session.sessionID);
  const other = await ctx.readDevice(panel.sessionID);

  expect([own?.deviceID, own?.capabilities.screen, other?.capabilities.screen]).toStrictEqual([
    registered.deviceID,
    true,
    false,
  ]);
});

test('it refuses a register from a device session', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');

  const refused = device.client.devices.register({
    clientActionID: crypto.randomUUID(),
    name: 'second',
  });

  expect(refused).rejects.toMatchObject({ status: 403 });
});

test('it never makes a session or a cookie when a full session registers', async () => {
  const ctx = await setupTest();
  const session = await ctx.enrol('full', 'phone');
  const before = await ctx.readSessionCount();

  const response = await fetch(`${ctx.url}/rpc/devices/register`, {
    method: 'POST',
    headers: {
      [clientHeaderName]: 'web',
      'content-type': 'application/json',
      cookie: `${sessionCookieName}=${session.token}`,
    },
    body: JSON.stringify({
      json: { clientActionID: crypto.randomUUID(), name: 'kitchen tab' },
    }),
  });

  const after = await ctx.readSessionCount();

  expect([response.status, response.headers.get('set-cookie'), after]).toStrictEqual([
    200,
    null,
    before,
  ]);
});

test('it lets a full session with a device row follow, switch its screen on and read its own image', async () => {
  const ctx = await setupTest();
  const session = await ctx.enrol('full', 'phone');

  const registered = await session.client.devices.register({
    clientActionID: crypto.randomUUID(),
    name: 'kitchen tab',
  });

  const stopped = new AbortController();

  const on = await session.client.devices.setCapability({ capability: 'screen', isOn: true });

  await seedImage(ctx.context.log, {
    image: 'k3x9m2p7qa',
    source: 'file',
    bytes: new Uint8Array([1, 2, 3]),
  });

  const events = await followTestDevice(
    session.client,
    { pixels: { width: 800, height: 600 } },
    { signal: stopped.signal },
  );

  const first = await events.next();

  await ctx.call('device.show', {
    device: registered.deviceID,
    content: { kind: 'image', image: 'k3x9m2p7qa' },
  });

  await events.next();

  const image = await session.client.devices.readImage({ image: 'k3x9m2p7qa' });

  stopped.abort();

  const buffer = await image.arrayBuffer();

  const bytes = new Uint8Array(buffer);

  expect([on, first.value, bytes]).toStrictEqual([
    { screen: 'on' },
    { kind: 'idle', scene: [] },
    new Uint8Array([1, 2, 3]),
  ]);
});

test('it updates the size that devices.list reads when a session resizes', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');

  const stopped = new AbortController();

  const events = await followTestDevice(
    device.client,
    { pixels: { width: 800, height: 600 } },
    { signal: stopped.signal },
  );

  await events.next();
  await device.client.devices.resize({ width: 1024, height: 768 });

  const listed = await ctx.call('devices.list', {});

  stopped.abort();

  expect(listed).toStrictEqual({
    status: 'ok',
    result: {
      devices: [
        expect.objectContaining({
          online: true,
          pixels: { width: 1024, height: 768, pixelRatio: 1 },
        }),
      ],
    },
  });
});

test('it refuses a resize outside the screen bounds', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');

  expect(device.client.devices.resize({ width: 0, height: 20_001 })).rejects.toThrow();
});

test('it refuses a device session its request for the conversation', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');

  const refused = device.client.conversation.read({ thread: 'conversation' });

  expect(refused).rejects.toMatchObject({ status: 403 });
});

test('it lets a device session reach only the paths of its own device', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');

  const paths = collectContractPaths(contract);

  const reached = await Promise.all(
    paths.map(async (path) => {
      const response = await ctx.callPath(path, device.token);

      await response?.body?.cancel();

      return { path, isReached: response !== null && response.status !== 403 };
    }),
  );

  expect(reached.filter((entry) => entry.isReached).map((entry) => entry.path)).toStrictEqual([
    '/rpc/devices/resize',
    '/rpc/devices/setCapability',
    '/rpc/devices/readImage',
    '/rpc/live/follow',
    '/rpc/sessions/signOut',
  ]);
});

test('it follows the device from what it shows now, then each show', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');
  const row = await ctx.readDevice(device.sessionID);

  const stopped = new AbortController();

  await device.client.devices.setCapability({ capability: 'screen', isOn: true });

  const events = await followTestDevice(
    device.client,
    { pixels: { width: 1920, height: 480 } },
    { signal: stopped.signal },
  );

  const first = await events.next();

  const shown = await ctx.call('device.show', {
    device: row?.deviceID ?? '',
    content: { kind: 'markdown', text: '# Saturday' },
    minutes: 10,
  });

  const second = await events.next();

  stopped.abort();

  expect([first.value, shown, second.value]).toStrictEqual([
    { kind: 'idle', scene: [] },
    { status: 'ok', result: { shown: true, until: expect.toBeString() } },
    { kind: 'show', content: { kind: 'markdown', text: '# Saturday' }, until: expect.toBeString() },
  ]);
});

test('it lets a device read the image it shows and no other image', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');
  const row = await ctx.readDevice(device.sessionID);

  const stopped = new AbortController();

  await device.client.devices.setCapability({ capability: 'screen', isOn: true });

  await seedImage(ctx.context.log, {
    image: 'k3x9m2p7qa',
    source: 'file',
    bytes: new Uint8Array([1, 2, 3]),
  });

  await seedImage(ctx.context.log, {
    image: 'p8w2n5c1rt',
    source: 'file',
    bytes: new Uint8Array([4]),
  });

  const events = await followTestDevice(
    device.client,
    { pixels: { width: 800, height: 600 } },
    { signal: stopped.signal },
  );

  await events.next();

  await ctx.call('device.show', {
    device: row?.deviceID ?? '',
    content: { kind: 'image', image: 'k3x9m2p7qa' },
  });

  await events.next();

  const shown = await device.client.devices.readImage({ image: 'k3x9m2p7qa' });

  const other = await device.client.devices
    .readImage({ image: 'p8w2n5c1rt' })
    .catch((error: unknown) => error);

  stopped.abort();

  const shownBuffer = await shown.arrayBuffer();

  expect([new Uint8Array(shownBuffer), other]).toStrictEqual([
    new Uint8Array([1, 2, 3]),
    expect.objectContaining({ code: 'NOT_SHOWN' }),
  ]);
});

test('it lets a device switch its own screen on and off', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');
  const on = await device.client.devices.setCapability({ capability: 'screen', isOn: true });
  const off = await device.client.devices.setCapability({ capability: 'screen', isOn: false });

  expect([on, off]).toStrictEqual([{ screen: 'on' }, { screen: 'off' }]);
});

test('it refuses a show on a screen that the device switched off', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');
  const row = await ctx.readDevice(device.sessionID);

  await device.client.devices.setCapability({ capability: 'screen', isOn: true });
  await device.client.devices.setCapability({ capability: 'screen', isOn: false });

  const outcome = await ctx.call('device.show', {
    device: row?.deviceID ?? '',
    content: { kind: 'markdown', text: '# Saturday' },
  });

  expect(outcome).toMatchObject({ refusalCode: 'SCREEN_OFF' });
});

test('it ends the stream of a device when the owner revokes its session, and removes its row', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');
  const events = await followTestDevice(device.client, { pixels: { width: 800, height: 600 } });

  await events.next();

  await ctx.ownerClient.sessions.revoke({
    clientActionID: crypto.randomUUID(),
    sessionID: device.sessionID,
  });

  const ended = await events.next();
  const row = await ctx.readDevice(device.sessionID);

  expect([ended, row]).toStrictEqual([{ done: true, value: undefined }, null]);
});

test('it signs a device out, and its row goes', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');

  await device.client.sessions.signOut({});

  expect(
    device.client.devices.setCapability({ capability: 'screen', isOn: true }),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

  const row = await ctx.readDevice(device.sessionID);

  expect(row).toBeNull();
});

test('it removes the row and ends the streams of a full session that signs out', async () => {
  const ctx = await setupTest();
  const session = await ctx.enrol('full', 'phone');

  await session.client.devices.register({
    clientActionID: crypto.randomUUID(),
    name: 'kitchen tab',
  });

  const events = await followTestDevice(session.client, { pixels: { width: 800, height: 600 } });

  await events.next();
  await session.client.sessions.signOut({});

  const ended = await events.next();
  const row = await ctx.readDevice(session.sessionID);

  expect([ended, row]).toStrictEqual([{ done: true, value: undefined }, null]);
});

test('it removes the row and ends the streams of a full session that the owner revokes', async () => {
  const ctx = await setupTest();
  const session = await ctx.enrol('full', 'phone');

  await session.client.devices.register({
    clientActionID: crypto.randomUUID(),
    name: 'kitchen tab',
  });

  const events = await followTestDevice(session.client, { pixels: { width: 800, height: 600 } });

  await events.next();

  await ctx.ownerClient.sessions.revoke({
    clientActionID: crypto.randomUUID(),
    sessionID: session.sessionID,
  });

  const ended = await events.next();
  const row = await ctx.readDevice(session.sessionID);

  expect([ended, row]).toStrictEqual([{ done: true, value: undefined }, null]);
});

test('it lets a browser with the token of a revoked device session enrol again', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');

  await ctx.ownerClient.sessions.revoke({
    clientActionID: crypto.randomUUID(),
    sessionID: device.sessionID,
  });

  const issued = await ctx.ownerClient.sessions.issueCode({
    clientActionID: crypto.randomUUID(),
    scope: 'device',
  });

  const enrolled = await device.client.sessions.enrol({
    clientActionID: crypto.randomUUID(),
    code: issued.code,
    deviceName: 'desk panel',
    tokenDelivery: 'bearer',
  });

  expect(enrolled.scope).toBe('device');
});

test('it lets a browser with the cookie of a revoked device session enrol again, and replaces the cookie', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');

  await ctx.ownerClient.sessions.revoke({
    clientActionID: crypto.randomUUID(),
    sessionID: device.sessionID,
  });

  const issued = await ctx.ownerClient.sessions.issueCode({
    clientActionID: crypto.randomUUID(),
    scope: 'device',
  });

  const response = await fetch(`${ctx.url}/rpc/sessions/enrol`, {
    method: 'POST',
    headers: {
      [clientHeaderName]: 'web',
      'content-type': 'application/json',
      cookie: `${sessionCookieName}=${device.token}`,
    },
    body: JSON.stringify({
      json: {
        clientActionID: crypto.randomUUID(),
        code: issued.code,
        deviceName: 'desk panel',
        tokenDelivery: 'cookie',
      },
    }),
  });

  const cookie = response.headers.get('set-cookie') ?? '';

  expect([response.status, cookie]).toStrictEqual([
    200,
    expect.stringMatching(new RegExp(`^${sessionCookieName}=[\\w-]{43};`, 'u')),
  ]);

  expect(cookie).not.toInclude(device.token);
});

test('it refuses a live device session an enrolment', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');

  const issued = await ctx.ownerClient.sessions.issueCode({
    clientActionID: crypto.randomUUID(),
    scope: 'device',
  });

  const refused = device.client.sessions.enrol({
    clientActionID: crypto.randomUUID(),
    code: issued.code,
    deviceName: 'second panel',
    tokenDelivery: 'bearer',
  });

  expect(refused).rejects.toMatchObject({ status: 403 });
});

test('it keeps the first enrolment code available while only a device holds a session', async () => {
  const ctx = await setupTest();

  await ctx.enrol('device', 'desk panel');

  const live = await ctx.writer.db
    .$extendTables<APITables>()
    .selectFrom('identities')
    .select('scope')
    .where('revoked_at', 'is', null)
    .execute();

  expect(live.map((row) => row.scope)).toStrictEqual(['full', 'device']);
});

test('it sends opened first, then the screen, on the device form of a live follow', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');

  const stream = await device.client.live.follow({
    device: { pixels: { width: 800, height: 600 } },
  });

  const first = await stream.next();
  const second = await stream.next();

  await stream.return(undefined);

  expect([first.value, second.value]).toStrictEqual([
    { kind: 'opened' },
    { kind: 'device', event: { kind: 'idle', scene: [] } },
  ]);
});

test('it refuses the page form of a live follow to a device session', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');

  expect(device.client.live.follow({ thread: 'conversation' })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
});

test('it keeps a device online while its device stream is open, and through a layout change', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');
  const row = await ctx.readDevice(device.sessionID);

  await device.client.devices.setCapability({ capability: 'screen', isOn: true });

  const stopped = new AbortController();

  const events = await followTestDevice(
    device.client,
    { pixels: { width: 800, height: 600 } },
    { signal: stopped.signal },
  );

  await events.next();

  await ctx.call('device.layout', {
    device: row?.deviceID ?? '',
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'pond', column: 1, row: 1 }],
  });

  const layout = await events.next();

  ctx.clock.advance(120_000);

  const isOnline = ctx.context.clients.devices.isOnline(row?.deviceID ?? '');

  stopped.abort();

  expect([layout.value?.kind, isOnline]).toStrictEqual(['layout', true]);
});

test('it turns a device offline once its connection closed and 60 s passed', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');
  const row = await ctx.readDevice(device.sessionID);

  const connection = new AbortController();

  const events = await followTestDevice(
    device.client,
    { pixels: { width: 800, height: 600 } },
    { signal: connection.signal },
  );

  await events.next();

  connection.abort();

  // the grace timer starts once the server drops the stream
  await waitForCondition(() => ctx.clock.readNextDueMs() !== null);

  ctx.clock.advance(60_000);

  await waitForCondition(() => !ctx.context.clients.devices.isOnline(row?.deviceID ?? ''));

  expect(ctx.context.clients.devices.isOnline(row?.deviceID ?? '')).toBeFalse();
});

test('it leaves the last seen time of a full session alone while its page stream is open', async () => {
  const ctx = await setupTest();
  const laptop = await ctx.enrol('full', 'laptop');
  const stream = await laptop.client.live.follow({});

  await stream.next();

  const before = await ctx.readLastSeen(laptop.sessionID);

  ctx.clock.advance(10 * 60_000);

  await stream.return(undefined);

  const after = await ctx.readLastSeen(laptop.sessionID);

  expect(after).toBe(before);
});

test('it keeps the last seen time of a session fresh while its device stream is open', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');
  const before = await ctx.readLastSeen(device.sessionID);

  ctx.clock.advance(60_000);

  const stream = await device.client.live.follow({
    device: { pixels: { width: 800, height: 600 } },
  });

  await stream.next();

  await waitForCondition(async () => (await ctx.readLastSeen(device.sessionID)) > before);

  await stream.return(undefined);

  const after = await ctx.readLastSeen(device.sessionID);

  expect(after).toBeGreaterThan(before);
});
