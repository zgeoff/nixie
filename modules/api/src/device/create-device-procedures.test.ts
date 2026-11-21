import { expect, test } from 'bun:test';
import { seedImage } from '@heynixie/connectors/test-utils';
import { clientHeaderName, contract } from '@heynixie/contract';
import { buildDeviceToolCaller } from '@heynixie/devices/test-utils';
import invariant from 'tiny-invariant';
import { buildTestClient } from '../test-utils/build-test-client';
import { collectContractPaths } from '../test-utils/collect-contract-paths';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import type { APITables } from '../types';

async function setupTest() {
  const api = await startTestAPI();
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
    call: buildDeviceToolCaller({
      log: api.context.log,
      definitions: api.context.definitions,
      clock: api.context.clock,
      streams: api.context.devices,
    }),
    readDevices: () =>
      api.writer.db
        .$extendTables<
          APITables & {
            devices: { device_id: string; name: string; capabilities: string };
          }
        >()
        .selectFrom('devices')
        .select(['device_id', 'name', 'capabilities'])
        .execute(),
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
  const devices = await ctx.readDevices();

  expect([device.scope, devices]).toStrictEqual([
    'device',
    [
      {
        device_id: expect.toBeString(),
        name: 'desk panel',
        capabilities: JSON.stringify({
          screen: false,
          camera: false,
          speaker: false,
          microphone: false,
        }),
      },
    ],
  ]);
});

test('it enrols a full session from a full code, with no device', async () => {
  const ctx = await setupTest();
  const session = await ctx.enrol('full', 'phone');
  const devices = await ctx.readDevices();

  expect([session.scope, devices]).toStrictEqual(['full', []]);
});

test('it refuses a session of the full scope a device stream', async () => {
  const ctx = await setupTest();
  const session = await ctx.enrol('full', 'phone');

  const refused = session.client.devices.follow({ pixels: { width: 800, height: 600 } });

  await expect(refused).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('it refuses a device session its request for the conversation', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');

  const refused = device.client.conversation.read({ thread: 'conversation' });

  await expect(refused).rejects.toMatchObject({ status: 403 });
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
    '/rpc/devices/follow',
    '/rpc/devices/setCapability',
    '/rpc/devices/readImage',
    '/rpc/sessions/signOut',
  ]);
});

test('it follows the device from what it shows now, then each show', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');
  const devices = await ctx.readDevices();

  const stopped = new AbortController();

  await device.client.devices.setCapability({ capability: 'screen', isOn: true });

  const events = await device.client.devices.follow(
    { pixels: { width: 1920, height: 480 } },
    { signal: stopped.signal },
  );

  const first = await events.next();

  const shown = await ctx.call('device.show', {
    device: devices[0]?.device_id ?? '',
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
  const devices = await ctx.readDevices();

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

  const events = await device.client.devices.follow(
    { pixels: { width: 800, height: 600 } },
    { signal: stopped.signal },
  );

  await events.next();

  await ctx.call('device.show', {
    device: devices[0]?.device_id ?? '',
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
  const devices = await ctx.readDevices();

  await device.client.devices.setCapability({ capability: 'screen', isOn: true });
  await device.client.devices.setCapability({ capability: 'screen', isOn: false });

  const outcome = await ctx.call('device.show', {
    device: devices[0]?.device_id ?? '',
    content: { kind: 'markdown', text: '# Saturday' },
  });

  expect(outcome).toMatchObject({ refusalCode: 'SCREEN_OFF' });
});

test('it ends the stream of a device when the owner revokes its session, and removes its row', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');
  const events = await device.client.devices.follow({ pixels: { width: 800, height: 600 } });

  await events.next();

  await ctx.ownerClient.sessions.revoke({
    clientActionID: crypto.randomUUID(),
    sessionID: device.sessionID,
  });

  const ended = await events.next();
  const devices = await ctx.readDevices();

  expect([ended, devices]).toStrictEqual([{ done: true, value: undefined }, []]);
});

test('it signs a device out, and its row goes', async () => {
  const ctx = await setupTest();
  const device = await ctx.enrol('device', 'desk panel');

  await device.client.sessions.signOut({});

  await expect(
    device.client.devices.setCapability({ capability: 'screen', isOn: true }),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

  const devices = await ctx.readDevices();

  expect(devices).toStrictEqual([]);
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
