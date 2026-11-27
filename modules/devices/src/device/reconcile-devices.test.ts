import { expect, test } from 'bun:test';
import { sessionHooks, updateSessionLabel } from '@heynixie/api';
import { buildTestClient, createDeviceSession } from '@heynixie/api/test-utils';
import { withWriteTransaction } from '@heynixie/log';
import { startTestDevicesAPI } from '../test-utils/start-test-devices-api';
import { readDeviceByIdentity } from './read-device-by-identity';
import { reconcileDevices } from './reconcile-devices';

async function setupTest() {
  const api = await startTestDevicesAPI();
  const owner = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, owner.token);

  const enrol = async (deviceName: string) => {
    const issued = await client.sessions.issueCode({ clientActionID: crypto.randomUUID() });

    return buildTestClient(api.url).sessions.enrol({
      clientActionID: crypto.randomUUID(),
      code: issued.code,
      deviceName,
      tokenDelivery: 'bearer',
    });
  };

  return {
    enrol,
    revoke: (sessionID: string) =>
      client.sessions.revoke({ clientActionID: crypto.randomUUID(), sessionID }),
    label: (sessionID: string, label: string) =>
      updateSessionLabel(api.context, { sessionID, label }),

    // the hooks of a nixie that has the devices feature off: none
    switchDevicesOff: () => {
      sessionHooks.set([]);
    },
    reconcile: () =>
      withWriteTransaction(api.context.log.writer, (tx) =>
        reconcileDevices(tx, api.context.clock.now()),
      ),
    readDevice: (identityID: string) => readDeviceByIdentity(api.context.log.writer.db, identityID),
  };
}

test('#reconcileDevices removes the device of a session that was revoked while devices were off', async () => {
  const ctx = await setupTest();
  const session = await ctx.enrol('tablet');

  ctx.switchDevicesOff();

  await ctx.revoke(session.sessionID);
  await ctx.reconcile();

  const device = await ctx.readDevice(session.sessionID);

  expect(device).toBeNull();
});

test('#reconcileDevices gives a device the label that its session got while devices were off', async () => {
  const ctx = await setupTest();
  const session = await ctx.enrol('tablet');

  ctx.switchDevicesOff();

  await ctx.label(session.sessionID, 'hall tablet');
  await ctx.reconcile();

  const device = await ctx.readDevice(session.sessionID);

  expect(device?.name).toBe('hall tablet');
});

test('#reconcileDevices keeps the device of a live session as it is', async () => {
  const ctx = await setupTest();
  const session = await ctx.enrol('tablet');

  await ctx.reconcile();

  const device = await ctx.readDevice(session.sessionID);

  expect(device?.name).toBe('tablet');
});
