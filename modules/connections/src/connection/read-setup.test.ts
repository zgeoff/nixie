import { expect, test } from 'bun:test';
import { startConnectionsHarness } from '../test-utils/start-connections-harness';
import { startGoogleConnections } from '../test-utils/start-google-connections';

test('it fills the steps from the origin of the page before a client is registered', async () => {
  const ctx = await startConnectionsHarness();
  const setup = await ctx.connections.readSetup('https://page.example.org');

  const client = setup.steps.find((step) => step.id === 'client');

  expect([
    setup.steps.map((step) => step.id),
    setup.client,
    client?.body.includes('https://page.example.org/connections/google/return'),
  ]).toStrictEqual([['project', 'apis', 'branding', 'audience', 'client', 'consent'], null, true]);
});

test('it fills the steps from the origin of the registered client, whatever origin the page has', async () => {
  const ctx = await startGoogleConnections();
  const setup = await ctx.connections.readSetup('https://page.example.org');

  const client = setup.steps.find((step) => step.id === 'client');

  expect([
    client?.body.includes('https://nixie.example.org/connections/google/return'),
    client?.body.includes('page.example.org'),
  ]).toStrictEqual([true, false]);
});
