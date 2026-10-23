import { expect, test } from 'bun:test';
import { buildTestClient } from '@heynixie/api/test-utils';
import { createTestClient } from './create-test-client';
import { startInProcessNixie } from './start-in-process-nixie';

async function setupTest() {
  const nixie = await startInProcessNixie();

  return { nixie };
}

test('it signs a client in as a device named laptop', async () => {
  const ctx = await setupTest();
  const created = await createTestClient(ctx.nixie);
  const listed = await created.client.sessions.list();

  expect(listed.sessions).toMatchObject([{ current: true, deviceName: 'laptop' }]);
});

test('it gives the device token, which signs in another client as the same device', async () => {
  const ctx = await setupTest();
  const created = await createTestClient(ctx.nixie);
  const listed = await buildTestClient(created.url, created.token).sessions.list();

  expect(listed.sessions).toMatchObject([{ current: true, deviceName: 'laptop' }]);
});

test('it gives a signed-out client that the API refuses', async () => {
  const ctx = await setupTest();
  const created = await createTestClient(ctx.nixie);

  const listed = created.signedOut.sessions.list();

  await listed.catch(() => {});

  expect(listed).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
