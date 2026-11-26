import { expect, onTestFinished, test } from 'bun:test';
import { connectTestGoogle } from './connect-test-google';
import { createTestClient } from './create-test-client';
import { startFakeGoogleSite } from './start-fake-google-site';
import { startSpawnedNixie } from './start-spawned-nixie';

async function setupTest() {
  const google = await startFakeGoogleSite();

  onTestFinished(() => google.stop());

  const nixie = await startSpawnedNixie({ googleURL: google.url, googleAPI: google.api });

  const server = nixie.harness.start();

  const api = await createTestClient(server);

  return { api };
}

test('it connects the account of the fake Google, and returns the connection that the list shows', async () => {
  const ctx = await setupTest();
  const connected = await connectTestGoogle(ctx.api);
  const listed = await ctx.api.client.connections.list();

  expect(listed).toStrictEqual([
    {
      connection: connected.connection,
      connector: 'google',
      label: expect.any(String),
      account: 'verify@example.test',
      status: 'active',
      reason: null,
      statusSince: expect.any(Date),
      lastSuccessAt: expect.toBeOneOf([null, expect.any(Date)]),
      scopes: expect.arrayContaining(['gmail.modify']),
      missing: [],
      fingerprint: expect.any(String),
      forget: null,
    },
  ]);
});
