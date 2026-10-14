import { expect, test } from 'bun:test';
import { createTestClient } from './create-test-client';
import { startTestNixie } from './start-test-nixie';

async function setupTest() {
  const nixie = await startTestNixie();

  return { nixie };
}

test('it signs a client in as a device named laptop', async () => {
  const ctx = await setupTest();

  const created = await createTestClient(ctx.nixie);
  const listed = await created.client.sessions.list();

  expect(listed.sessions).toMatchObject([{ current: true, deviceName: 'laptop' }]);
}, 60_000);

test('it gives a signed-out client that the API refuses', async () => {
  const ctx = await setupTest();

  const created = await createTestClient(ctx.nixie);
  const listed = created.signedOut.sessions.list();

  await listed.catch(() => {});

  expect(listed).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
}, 60_000);
