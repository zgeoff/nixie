import { expect, onTestFinished, test } from 'bun:test';
import { bodyFieldReaders } from '@heynixie/api';
import { buildTestClient, createDeviceSession } from '@heynixie/api/test-utils';
import { seedPackageCard } from '../test-utils/seed-package-card';
import { startTestDevicesAPI } from '../test-utils/start-test-devices-api';
import { readPackageBodyFields } from './read-package-body-fields';

async function setupTest() {
  const api = await startTestDevicesAPI();
  const owner = await createDeviceSession(api.context, 'laptop');

  bodyFieldReaders.set([readPackageBodyFields]);

  onTestFinished(() => {
    bodyFieldReaders.set([]);
  });

  return { api, client: buildTestClient(api.url, owner.token) };
}

test('it gives the card of a package install the package and its hash', async () => {
  const ctx = await setupTest();
  const card = await seedPackageCard(ctx.api.context);
  const read = await ctx.client.approvals.readProposals({ proposalIDs: [card.shortID] });

  expect(read.proposals.map((entry) => entry.body?.package)).toStrictEqual([
    {
      name: 'chart.js',
      version: '4.4.6',
      unpackedBytes: 2048,
      publisher: 'a-publisher',
      description: 'Charts for pages',
      integrity: `sha512-${'A'.repeat(86)}==`,
    },
  ]);
});

test('it offers a package install no always-allow, and asks for the passkey', async () => {
  const ctx = await setupTest();
  const card = await seedPackageCard(ctx.api.context);
  const read = await ctx.client.approvals.readProposals({ proposalIDs: [card.shortID] });

  expect(read.proposals.map((entry) => [entry.choices, entry.passkeyChoices])).toStrictEqual([
    [['approve', 'defer', 'decline'], ['approve']],
  ]);
});
