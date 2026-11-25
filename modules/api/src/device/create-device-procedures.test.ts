import { expect, test } from 'bun:test';
import { seedImage } from '@heynixie/connectors/test-utils';
import { clientHeaderName, contract, sessionCookieName } from '@heynixie/contract';
import { readDeviceByIdentity } from '@heynixie/devices';
import {
  buildTestFetching,
  makeDeviceToolCaller,
  seedDevicePackage,
} from '@heynixie/devices/test-utils';
import type { JSONObject } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { createConversationTask } from '@heynixie/tasks';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { buildTestClient } from '../test-utils/build-test-client';
import { collectContractPaths } from '../test-utils/collect-contract-paths';
import { createDeviceSession } from '../test-utils/create-device-session';
import { dropLiveStream } from '../test-utils/drop-live-stream';
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

  const call = makeDeviceToolCaller({
    log: api.context.log,
    definitions: api.context.definitions,
    clock: api.context.clock,
    streams: api.context.clients.devices,
    fetching: buildTestFetching({
      clock: api.context.clock,
      allowedHosts: ['tides.example'],
    }).fetching,
  });

  // a device whose screen is on and follows its stream, with a layout of one region that holds
  // markdown, and the ID the stream gave that content
  const startRegionDevice = async (content?: JSONObject) => {
    const device = await enrol('device', 'desk panel');
    const row = await readDeviceByIdentity(api.writer.db, device.sessionID);

    invariant(row, 'the enrolled device has its row');

    await device.client.devices.setCapability({ capability: 'screen', isOn: true });

    const stopped = new AbortController();

    const events = await followTestDevice(
      device.client,
      { pixels: { width: 1872, height: 1404, pixelRatio: 2 } },
      { signal: stopped.signal },
    );

    await events.next();

    await call('device.layout', {
      device: row.deviceID,
      columns: ['1fr'],
      rows: ['1fr'],
      regions: [{ name: 'pond', column: 1, row: 1 }],
    });

    await call('device.region', {
      device: row.deviceID,
      region: 'pond',
      content: content ?? { kind: 'markdown', markdown: 'Ripples' },
    });

    let shown: string | null = null;
    let frame: string | null = null;

    while (shown === null) {
      const next = await events.next();

      const region =
        next.value !== undefined && next.value.kind === 'layout'
          ? next.value.layout?.regions[0]
          : undefined;

      shown = region?.shown ?? null;
      frame = region?.content?.kind === 'html' ? region.content.frame : null;
    }

    return {
      client: device.client,
      deviceID: row.deviceID,
      shown,
      frame,
      events,
      stop: () => {
        stopped.abort();
      },
    };
  };

  return {
    ...api,
    ownerClient,
    enrol,
    call,
    startRegionDevice,
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
  [
    'pageError',
    (client: Client) => client.devices.pageError({ region: 'pond', shown: 'x', message: 'boom' }),
  ],
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

test('it keeps the time zone that a device sends with its size', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');
  const row = await readDeviceByIdentity(ctx.writer.db, device.sessionID);

  const stopped = new AbortController();

  const events = await followTestDevice(
    device.client,
    { pixels: { width: 800, height: 600, timeZone: 'Australia/Sydney' } },
    { signal: stopped.signal },
  );

  await events.next();

  const opened = ctx.context.clients.devices.readPixels(row?.deviceID ?? '');

  await device.client.devices.resize({
    width: 1024,
    height: 768,
    pixelRatio: 2,
    timeZone: 'Europe/London',
  });

  const resized = ctx.context.clients.devices.readPixels(row?.deviceID ?? '');

  stopped.abort();

  expect({ opened, resized }).toStrictEqual({
    opened: { width: 800, height: 600, pixelRatio: 1, timeZone: 'Australia/Sydney' },
    resized: { width: 1024, height: 768, pixelRatio: 2, timeZone: 'Europe/London' },
  });
});

test('it refuses a resize with a time zone that does not exist', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');

  expect(
    device.client.devices.resize({ width: 800, height: 600, timeZone: 'Mars/Olympus' }),
  ).rejects.toThrow();
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
    '/rpc/devices/pageError',
    '/rpc/devices/pageEvent',
    '/rpc/devices/pageData',
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

test('it turns a device offline within 60 s of its connection dropping, with the server told nothing', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');
  const row = await ctx.readDevice(device.sessionID);

  await dropLiveStream(ctx.url, device.token, {
    device: { pixels: { width: 800, height: 600 } },
  });

  // the server notices the dead connection within 10 s, and the grace timer starts then
  await waitForCondition(() => ctx.clock.readNextDueMs() !== null, { timeoutMs: 10_000 });

  ctx.clock.advance(60_000);

  await waitForCondition(() => !ctx.context.clients.devices.isOnline(row?.deviceID ?? ''));

  expect(ctx.context.clients.devices.isOnline(row?.deviceID ?? '')).toBeFalse();
});

test('it leaves the last seen time of a full session alone while its page stream is open', async () => {
  const ctx = await setupTest();
  const laptop = await ctx.enrol('full', 'laptop');
  const panel = await ctx.enrol('device', 'desk panel');

  const panelStream = await panel.client.live.follow({
    device: { pixels: { width: 800, height: 600 } },
  });

  await panelStream.next();

  const panelBefore = await ctx.readLastSeen(panel.sessionID);

  // inside the interval, the call that opens the stream moves nothing, so any write shows
  ctx.clock.advance(ctx.context.settings.lastSeenIntervalMs / 2);

  const laptopBefore = await ctx.readLastSeen(laptop.sessionID);
  const pageStream = await laptop.client.live.follow({});

  await pageStream.next();

  ctx.clock.advance(10 * 60_000);

  // the device stream's periodic update shows that the intervals ran
  await waitForCondition(async () => (await ctx.readLastSeen(panel.sessionID)) > panelBefore);

  await pageStream.return(undefined);
  await panelStream.return(undefined);

  const laptopAfter = await ctx.readLastSeen(laptop.sessionID);

  expect(laptopAfter).toBe(laptopBefore);
});

test('it keeps the last seen time of a session fresh while its device stream is open', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');

  const stream = await device.client.live.follow({
    device: { pixels: { width: 800, height: 600 } },
  });

  await stream.next();

  // only a periodic update moves the time once the clock passes the interval
  const afterOpen = await ctx.readLastSeen(device.sessionID);

  ctx.clock.advance(60_000);

  await waitForCondition(async () => (await ctx.readLastSeen(device.sessionID)) > afterOpen);

  await stream.return(undefined);

  const afterBeat = await ctx.readLastSeen(device.sessionID);

  expect(afterBeat).toBeGreaterThan(afterOpen);
});

test('it hands the device the ID of the content of each region', async () => {
  const ctx = await setupTest();
  const region = await ctx.startRegionDevice();

  region.stop();

  expect(region.shown).toBeString();
});

test('it keeps an error that a device reports for the content its region shows, for device.preview', async () => {
  const ctx = await setupTest();
  const region = await ctx.startRegionDevice();

  await region.client.devices.pageError({
    region: 'pond',
    shown: region.shown ?? '',
    message: 'TypeError: x is undefined',
  });

  const outcome = await ctx.call('device.preview', { device: region.deviceID });

  region.stop();

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { errors: [{ region: 'pond', message: 'TypeError: x is undefined' }] },
  });
});

test('it refuses an error for content that its region no longer shows, and keeps nothing', async () => {
  const ctx = await setupTest();
  const region = await ctx.startRegionDevice();

  const refused = region.client.devices.pageError({
    region: 'pond',
    shown: 'stale-id',
    message: 'boom',
  });

  expect(refused).rejects.toMatchObject({ code: 'STALE' });

  const outcome = await ctx.call('device.preview', { device: region.deviceID });

  region.stop();

  expect(outcome).toMatchObject({ result: { errors: [] } });
});

test('it keeps an event that a page sends, with its data, on the conversation thread', async () => {
  const ctx = await setupTest();
  const page = await ctx.startRegionDevice({ kind: 'html', html: '<p>ripples</p>' });

  await page.client.devices.pageEvent({
    region: 'pond',
    shown: page.shown ?? '',
    name: 'touched',
    data: { ripples: 3 },
    wake: false,
  });

  const [event] = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['device.page_event'],
  });

  page.stop();

  expect([event?.record.thread, event?.record.payload, event?.record.erasable]).toStrictEqual([
    'conversation',
    {
      device: page.deviceID,
      deviceName: 'desk panel',
      region: 'pond',
      shown: page.shown ?? '',
      name: 'touched',
      wake: false,
    },
    { status: 'readable', fields: { data: { ripples: 3 } } },
  ]);
});

test('it refuses an event for content that its region no longer shows, and keeps nothing', async () => {
  const ctx = await setupTest();
  const page = await ctx.startRegionDevice({ kind: 'html', html: '<p>ripples</p>' });

  const refused = page.client.devices.pageEvent({
    region: 'pond',
    shown: 'stale-id',
    name: 'touched',
    wake: false,
  });

  expect(refused).rejects.toMatchObject({ code: 'STALE' });

  const events = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['device.page_event'],
  });

  page.stop();

  expect(events).toStrictEqual([]);
});

test('it refuses an event from a region that shows no page', async () => {
  const ctx = await setupTest();
  const region = await ctx.startRegionDevice();

  const refused = region.client.devices.pageEvent({
    region: 'pond',
    shown: region.shown ?? '',
    name: 'touched',
    wake: false,
  });

  expect(refused).rejects.toMatchObject({ code: 'STALE' });

  region.stop();
});

test('it refuses an event with data past 2 KiB', async () => {
  const ctx = await setupTest();
  const page = await ctx.startRegionDevice({ kind: 'html', html: '<p>ripples</p>' });

  const refused = page.client.devices.pageEvent({
    region: 'pond',
    shown: page.shown ?? '',
    name: 'touched',
    data: 'x'.repeat(2048),
    wake: false,
  });

  expect(refused).rejects.toThrow();

  page.stop();
});

test('it refuses an event from a full session that holds no device', async () => {
  const ctx = await setupTest();
  const full = await ctx.enrol('full', 'laptop');

  const refused = full.client.devices.pageEvent({
    region: 'pond',
    shown: 'any',
    name: 'touched',
    wake: false,
  });

  expect(refused).rejects.toMatchObject({ code: 'NOT_A_DEVICE' });
});

test('it wakes the conversation with an event that asks for it, when the conversation has a task', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const page = await ctx.startRegionDevice({ kind: 'html', html: '<p>ripples</p>' });

  await page.client.devices.pageEvent({
    region: 'pond',
    shown: page.shown ?? '',
    name: 'touched',
    wake: true,
  });

  const [event] = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['device.page_event'],
  });

  page.stop();

  expect(event?.record.payload['wake']).toBe(true);
});

test('it serves a page by its frame ticket with no session and no client header', async () => {
  const ctx = await setupTest();
  const page = await ctx.startRegionDevice({ kind: 'html', html: '<p>ripples</p>' });
  const response = await fetch(`${ctx.url}/rpc/device/frames/${page.frame ?? ''}`);

  page.stop();

  const body = await response.text();

  expect([
    response.status,
    response.headers.get('content-type'),
    response.headers.get('content-security-policy'),
    body.includes('<p>ripples</p>'),
  ]).toStrictEqual([
    200,
    'text/html; charset=utf-8',
    expect.stringContaining("connect-src 'none'"),
    true,
  ]);
});

test('it names its own origin in the policy of a frame', async () => {
  const ctx = await setupTest();
  const page = await ctx.startRegionDevice({ kind: 'html', html: '<p>ripples</p>' });

  const response = await fetch(`${ctx.url}/rpc/device/frames/${page.frame ?? ''}`, {
    headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'nixie.test' },
  });

  page.stop();

  expect(response.headers.get('content-security-policy')).toContain(
    'img-src https://nixie.test/rpc/device/images/ data:',
  );
});

test('it ignores a forwarded host that could add to the policy', async () => {
  const ctx = await setupTest();
  const page = await ctx.startRegionDevice({ kind: 'html', html: '<p>ripples</p>' });

  const response = await fetch(`${ctx.url}/rpc/device/frames/${page.frame ?? ''}`, {
    headers: { 'x-forwarded-host': 'evil.test; connect-src *' },
  });

  page.stop();

  expect(response.headers.get('content-security-policy')).not.toContain('evil.test');
});

test('it answers 404 for a frame ticket that nobody issued', async () => {
  const ctx = await setupTest();
  const response = await fetch(`${ctx.url}/rpc/device/frames/0e0b4b3e-0000-4000-8000-000000000000`);

  expect(response.status).toBe(404);
});

test('it answers 404 for a frame ticket once new content replaced the page', async () => {
  const ctx = await setupTest();
  const page = await ctx.startRegionDevice({ kind: 'html', html: '<p>ripples</p>' });

  await ctx.call('device.region', {
    device: page.deviceID,
    region: 'pond',
    content: { kind: 'html', html: '<p>other</p>' },
  });

  const response = await fetch(`${ctx.url}/rpc/device/frames/${page.frame ?? ''}`);

  page.stop();

  expect(response.status).toBe(404);
});

test('it serves a declared image by its image ticket and no other image', async () => {
  const ctx = await setupTest();

  await seedImage(ctx.context.log, {
    image: 'k3x9m2p7qa',
    source: 'file',
    bytes: new Uint8Array([1, 2, 3]),
  });

  const page = await ctx.startRegionDevice({
    kind: 'html',
    html: '<p>ripples</p>',
    images: ['k3x9m2p7qa'],
  });

  const framed = await fetch(`${ctx.url}/rpc/device/frames/${page.frame ?? ''}`);
  const frame = await framed.text();

  const found = /"k3x9m2p7qa":"[^"]*\/rpc\/device\/images\/(?<ticket>[^"]+)"/u.exec(frame);
  const ticket = found?.groups?.['ticket'] ?? '';

  const image = await fetch(`${ctx.url}/rpc/device/images/${ticket}`);
  const other = await fetch(`${ctx.url}/rpc/device/images/${page.frame ?? ''}`);

  page.stop();

  const buffer = await image.arrayBuffer();

  const bytes = new Uint8Array(buffer);

  expect([image.status, bytes, other.status]).toStrictEqual([200, new Uint8Array([1, 2, 3]), 404]);
});

test('it serves a file of an approved package, with no session and a long cache', async () => {
  const ctx = await setupTest();

  await seedDevicePackage(
    {
      log: ctx.context.log,
      definitions: ctx.context.definitions,
      clock: ctx.context.clock,
      streams: ctx.context.clients.devices,
    },
    'chart.js@4.4.6',
    { 'dist/chart.js': 'var Chart = 1;' },
  );

  const response = await fetch(`${ctx.url}/rpc/device/packages/chart.js@4.4.6/dist/chart.js`);

  expect([
    response.status,
    await response.text(),
    response.headers.get('content-type'),
    response.headers.get('x-content-type-options'),
    response.headers.get('cache-control'),
  ]).toStrictEqual([
    200,
    'var Chart = 1;',
    'text/javascript; charset=utf-8',
    'nosniff',
    'public, max-age=31536000, immutable',
  ]);
});

test('it serves a file of a scoped package', async () => {
  const ctx = await setupTest();

  await seedDevicePackage(
    {
      log: ctx.context.log,
      definitions: ctx.context.definitions,
      clock: ctx.context.clock,
      streams: ctx.context.clients.devices,
    },
    '@scope/pkg@1.0.0',
    { 'index.js': 'var scoped = 1;' },
  );

  const response = await fetch(`${ctx.url}/rpc/device/packages/@scope/pkg@1.0.0/index.js`);

  expect([response.status, await response.text()]).toStrictEqual([200, 'var scoped = 1;']);
});

test.each([
  ['a package nobody approved', '/rpc/device/packages/d3@7.9.0/dist/d3.js'],
  ['a version nobody approved', '/rpc/device/packages/chart.js@4.4.5/dist/chart.js'],
  ['a path that the package does not hold', '/rpc/device/packages/chart.js@4.4.6/secret.js'],
])('it answers 404 for %s', async (_title, path) => {
  const ctx = await setupTest();

  await seedDevicePackage(
    {
      log: ctx.context.log,
      definitions: ctx.context.definitions,
      clock: ctx.context.clock,
      streams: ctx.context.clients.devices,
    },
    'chart.js@4.4.6',
    { 'dist/chart.js': 'var Chart = 1;' },
  );

  const response = await fetch(`${ctx.url}${path}`);

  expect(response.status).toBe(404);
});

test('it answers a page the fetch that its region declared, and refuses the others', async () => {
  const ctx = await setupTest();

  const page = await ctx.startRegionDevice({
    kind: 'html',
    html: '<p>tides</p>',
    fetches: [{ url: 'https://tides.example/today' }],
  });

  const streams = ctx.context.clients.devices;
  const shown = page.shown ?? '';
  const url = 'https://tides.example/today';

  streams.fetches.declare(
    { deviceID: page.deviceID, region: 'pond' },
    { shown, fetches: [{ url, refreshMinutes: undefined }], isCovered: true },
  );

  const notReady = await page.client.devices
    .pageData({ region: 'pond', shown, url })
    .catch((error: unknown) => error);

  streams.fetches.record(
    { deviceID: page.deviceID, region: 'pond', shown, url },
    {
      kind: 'body',
      status: 200,
      type: 'application/json',
      body: '{"high":"14:05"}',
      fetchedAtMs: Date.parse('2026-11-21T08:00:00.000Z'),
    },
  );

  const answered = await page.client.devices.pageData({ region: 'pond', shown, url });

  const undeclared = await page.client.devices
    .pageData({ region: 'pond', shown, url: 'https://other.example/x' })
    .catch((error: unknown) => error);

  const stale = await page.client.devices
    .pageData({ region: 'pond', shown: 'zzzzzzzzzz', url })
    .catch((error: unknown) => error);

  page.stop();

  expect([notReady, undeclared, stale]).toMatchObject([
    { code: 'NOT_READY' },
    { code: 'NOT_DECLARED' },
    { code: 'STALE' },
  ]);

  expect(answered).toStrictEqual({
    status: 200,
    type: 'application/json',
    body: '{"high":"14:05"}',
    fetchedAt: '2026-11-21T08:00:00.000Z',
  });
});

test('it answers a refused fetch to the page as REFUSED', async () => {
  const ctx = await setupTest();

  const page = await ctx.startRegionDevice({
    kind: 'html',
    html: '<p>tides</p>',
    fetches: [{ url: 'https://tides.example/today' }],
  });

  const streams = ctx.context.clients.devices;
  const url = 'https://tides.example/today';

  streams.fetches.declare(
    { deviceID: page.deviceID, region: 'pond' },
    { shown: page.shown ?? '', fetches: [{ url, refreshMinutes: undefined }], isCovered: true },
  );

  streams.fetches.record(
    { deviceID: page.deviceID, region: 'pond', shown: page.shown ?? '', url },
    {
      kind: 'refused',
      reason: 'the rules no longer allow it',
    },
  );

  const refused = page.client.devices.pageData({ region: 'pond', shown: page.shown ?? '', url });

  page.stop();

  expect(refused).rejects.toMatchObject({ code: 'REFUSED' });
});
