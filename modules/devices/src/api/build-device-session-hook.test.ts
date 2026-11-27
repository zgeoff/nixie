import { expect, test } from 'bun:test';
import { buildTestClient, createDeviceSession, startTestAPI } from '@heynixie/api/test-utils';
import { readDeviceByIdentity } from '../device/read-device-by-identity';
import { startTestDevicesAPI } from '../test-utils/start-test-devices-api';

test('it gives a session that enrols a device row, and takes it away when the session is revoked', async () => {
  const api = await startTestDevicesAPI();
  const owner = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, owner.token);

  const issued = await client.sessions.issueCode({ clientActionID: crypto.randomUUID() });

  const enrolled = await buildTestClient(api.url).sessions.enrol({
    clientActionID: crypto.randomUUID(),
    code: issued.code,
    deviceName: 'tablet',
    tokenDelivery: 'bearer',
  });

  const before = await readDeviceByIdentity(api.context.log.writer.db, enrolled.sessionID);

  await client.sessions.revoke({
    clientActionID: crypto.randomUUID(),
    sessionID: enrolled.sessionID,
  });

  const after = await readDeviceByIdentity(api.context.log.writer.db, enrolled.sessionID);

  expect([before?.name, after]).toStrictEqual(['tablet', null]);
});

test('it keeps no device row when the devices feature is off', async () => {
  const api = await startTestAPI();
  const owner = await createDeviceSession(api.context, 'laptop');
  const row = await readDeviceByIdentity(api.context.log.writer.db, owner.sessionID);

  expect(row).toBeNull();
});
