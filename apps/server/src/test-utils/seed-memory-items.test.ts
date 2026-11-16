import { expect, test } from 'bun:test';
import { readPurgeState } from './read-purge-state';
import { seedMemoryItems } from './seed-memory-items';
import { startInProcessNixie } from './start-in-process-nixie';

test('it seeds one item whose values no purge has touched', async () => {
  const seeded = Promise.withResolvers<{ itemID: string }>();

  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    beforeStart: async (files) => {
      const seed = await seedMemoryItems(files);

      seeded.resolve(seed);
    },
  });

  const seed = await seeded.promise;

  await nixie.waitForLogEvent('ready');

  nixie.signalStop();

  await nixie.waitForExit();

  const state = await readPurgeState(nixie);

  expect(state.purges).toStrictEqual([]);
  expect(state.keyIDs).toContain(seed.itemID);
});
