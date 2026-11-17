import { expect, test } from 'bun:test';
import type { LogRecord } from '@heynixie/log';
import type { PurgeRow } from '@heynixie/memory/test-utils';
import { readPurgeState } from './read-purge-state';
import { readTestRecords } from './read-test-records';
import type { BegunPurgeSeed } from './seed-begun-purge';
import { seedBegunPurge } from './seed-begun-purge';
import { startInProcessNixie } from './start-in-process-nixie';

test('it leaves one item with an open purge for the message the forget removed', async () => {
  const seeded = Promise.withResolvers<BegunPurgeSeed>();
  const read = Promise.withResolvers<readonly PurgeRow[]>();

  await startInProcessNixie({
    hasStarterRules: false,
    beforeStart: async (files) => {
      const seed = await seedBegunPurge(files);

      seeded.resolve(seed);

      const state = await readPurgeState(files);

      read.resolve(state.purges);
    },
  });

  const seed = await seeded.promise;
  const rows = await read.promise;

  expect(rows).toStrictEqual([
    {
      record_sequence: seed.recordSequence,
      item_id: seed.itemID,
      closed_sequence: null,
      purged_sequence: null,
    },
  ]);
});

test('it begins the forget of the purged item after the purge set when the item is forgetting', async () => {
  const seeded = Promise.withResolvers<BegunPurgeSeed>();
  const read = Promise.withResolvers<readonly LogRecord[]>();

  await startInProcessNixie({
    hasStarterRules: false,
    beforeStart: async (files) => {
      const seed = await seedBegunPurge(files, { isOwned: true, isItemForgetting: true });

      seeded.resolve(seed);

      const records = await readTestRecords(files.dataDir, files.deploymentKey);

      read.resolve(records);
    },
  });

  const seed = await seeded.promise;
  const records = await read.promise;

  expect(records.slice(-2)).toMatchObject([
    { kind: 'memory.evidence_purge_started' },
    { kind: 'memory.forget_started', payload: { itemID: seed.itemID } },
  ]);
});
