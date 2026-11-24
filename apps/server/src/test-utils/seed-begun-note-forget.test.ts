import { expect, test } from 'bun:test';
import { z } from 'zod';
import { readPurgeState } from './read-purge-state';
import { readTestRecords } from './read-test-records';
import { seedBegunNoteForget } from './seed-begun-note-forget';
import type { BegunNoteForgetSeed } from './seed-begun-note-forget';
import { startInProcessNixie } from './start-in-process-nixie';

test('it leaves a note forget that a start finishes, with the note keys gone before erasure.finished', async () => {
  const seeded = Promise.withResolvers<BegunNoteForgetSeed>();

  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    beforeStart: async (files) => {
      const seed = await seedBegunNoteForget(files);

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
  const keysSchema = z.object({ ids: z.array(z.string()) });
  const startedSchema = z.object({ capture: z.object({ keys: keysSchema }) });
  const captured = startedSchema.parse(erasures[0]?.payload).capture.keys.ids;

  expect(erasures.map((record) => [record.kind, record.payload['targetID']])).toStrictEqual([
    ['erasure.started', seed.noteID],
    ['erasure.finished', seed.noteID],
  ]);

  expect(captured.length).toBeGreaterThan(0);
  expect(state.keyIDs).not.toContainAnyValues(captured);
});
