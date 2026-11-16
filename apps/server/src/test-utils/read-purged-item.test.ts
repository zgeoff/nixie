import { expect, test } from 'bun:test';
import type { PurgedItem } from './read-purged-item';
import { readPurgedItem } from './read-purged-item';
import { seedBegunPurge } from './seed-begun-purge';
import { startInProcessNixie } from './start-in-process-nixie';

test('it reads the history and labels of an item before its purge runs', async () => {
  const read = Promise.withResolvers<PurgedItem>();

  await startInProcessNixie({
    hasStarterRules: false,
    beforeStart: async (files) => {
      const seed = await seedBegunPurge(files);
      const item = await readPurgedItem(files, seed.itemID);

      read.resolve(item);
    },
  });

  const item = await read.promise;

  expect(item).toStrictEqual({
    versions: [
      { version: 1, status: 'shredded', isRemoved: true, isBridge: false },
      { version: 2, status: 'readable', isRemoved: false, isBridge: false },
    ],
    labels: { gist: 'keeps bees', topic: 'garden', triggers: ['bees'] },
  });
});
