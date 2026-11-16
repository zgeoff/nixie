import { expect, test } from 'bun:test';
import { readPurgeState } from './read-purge-state';
import { seedBegunPurge } from './seed-begun-purge';
import { startInProcessNixie } from './start-in-process-nixie';

test('it reads the open purge and the item key of a stopped nixie', async () => {
  const seeded = Promise.withResolvers<{ itemID: string; recordSequence: number }>();

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

  const state = await readPurgeState(nixie);

  expect(state.purges).toStrictEqual([
    {
      record_sequence: seed.recordSequence,
      item_id: seed.itemID,
      closed_sequence: expect.toBeNumber(),
      purged_sequence: expect.toBeNumber(),
    },
  ]);

  expect(state.keyIDs).not.toContain(seed.itemID);
});
