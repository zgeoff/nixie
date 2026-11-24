import { expect, test } from 'bun:test';
import { z } from 'zod';
import { readSurvivingKeyIDs } from './read-surviving-key-ids';
import { readTestRecords } from './read-test-records';
import { seedBegunNoteForget } from './seed-begun-note-forget';
import { startInProcessNixie } from './start-in-process-nixie';

test('it finds the keys that the key store holds, and none that it never held', async () => {
  const read = Promise.withResolvers<{
    captured: readonly string[];
    surviving: readonly string[];
  }>();

  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    beforeStart: async (files) => {
      await seedBegunNoteForget(files);

      const records = await readTestRecords(files.dataDir, files.deploymentKey);

      const started = records.find((record) => record.kind === 'erasure.started');
      const keys = z.object({ ids: z.array(z.string()) });
      const startedSchema = z.object({ capture: z.object({ keys }) });
      const captured = startedSchema.parse(started?.payload).capture.keys.ids;

      read.resolve({
        captured,
        surviving: await readSurvivingKeyIDs(files, [...captured, 'a-key-that-never-existed']),
      });
    },
  });

  await nixie.waitForLogEvent('ready');

  nixie.signalStop();

  await nixie.waitForExit();

  const result = await read.promise;

  expect(result.captured.length).toBeGreaterThan(0);
  expect(result.surviving).toIncludeSameMembers(result.captured);
});
