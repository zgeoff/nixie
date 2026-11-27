import { expect, test } from 'bun:test';
import { readPurgeState } from './read-purge-state';
import { readTestRecords } from './read-test-records';
import { seedBegunItemForget } from './seed-begun-item-forget';
import type { BegunItemForgetSeed } from './seed-begun-item-forget';
import { startInProcessNixie } from './start-in-process-nixie';

test('it leaves a memory item forget that a start finishes, with the item keys gone before erasure.finished', async () => {
  const seeded = Promise.withResolvers<BegunItemForgetSeed>();

  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    beforeStart: async (files) => {
      const seed = await seedBegunItemForget(files);

      seeded.resolve(seed);
    },
  });

  await nixie.waitForLogEvent('ready');

  nixie.signalStop();

  await nixie.waitForExit();

  const seed = await seeded.promise;
  const records = await readTestRecords(nixie.dataDir, nixie.deploymentKey);
  const state = await readPurgeState(nixie);

  const erasures = records.filter((record) => record.kind.startsWith('erasure.'));

  const surviving = state.keyIDs.filter(
    (keyID) => keyID === seed.itemID || keyID.startsWith(`${seed.itemID}/`),
  );

  expect(erasures.map((record) => [record.kind, record.payload['targetID']])).toStrictEqual([
    ['erasure.started', seed.itemID],
    ['erasure.finished', seed.itemID],
  ]);

  expect(surviving).toStrictEqual([]);
});
