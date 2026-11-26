import { expect, test } from 'bun:test';
import { readStoppedProposal } from './read-stopped-proposal';
import type { BegunPurgeSeed } from './seed-begun-purge';
import { seedBegunPurge } from './seed-begun-purge';
import { startInProcessNixie } from './start-in-process-nixie';

async function setupTest() {
  const seeded = Promise.withResolvers<BegunPurgeSeed>();

  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    beforeStart: async (files) => {
      const seed = await seedBegunPurge(files, { isOwned: true });

      seeded.resolve(seed);
    },
  });

  const seed = await seeded.promise;

  await nixie.waitForLogEvent('ready');

  nixie.signalStop();

  await nixie.waitForExit();

  return { seed, read: (proposalID: string) => readStoppedProposal(nixie, proposalID) };
}

test('it reads the shared row of a proposal from a stopped nixie', async () => {
  const ctx = await setupTest();
  const row = await ctx.read(ctx.seed.proposalID);

  expect(row?.id).toBe(ctx.seed.proposalID);
});

test('it reads null for a proposal the data does not hold', async () => {
  const ctx = await setupTest();
  const row = await ctx.read('a9f1c0de-0000-4000-8000-000000000000');

  expect(row).toBeNull();
});
