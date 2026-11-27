import { expect, test } from 'bun:test';
import {
  readPurgeState,
  readSurvivingKeyIDs,
  readTestRecords,
  seedBegunItemForget,
  seedBegunNoteForget,
  startE2ENixie,
} from '@heynixie/server/test-utils';
import { z } from 'zod';

async function setupTest() {
  const nixie = await startE2ENixie();
  const seed = await seedBegunNoteForget(nixie);
  const records = await readTestRecords(nixie.dataDir, nixie.deploymentKey);

  const started = records.find((record) => record.kind === 'erasure.started');
  const keys = z.object({ ids: z.array(z.string()) });
  const startedSchema = z.object({ capture: z.object({ keys }) });

  return { nixie, seed, started: startedSchema.parse(started?.payload) };
}

test.each([
  'erasure.begun',
  'erasure.sandboxes_destroyed',
  'erasure.keys_removed',
  'erasure.cleaned',
  'erasure.turn_inputs_removed',
] as const)(
  'it finishes the note forget that nixie was killed during at %s, with every captured key gone and counted',
  async (point) => {
    const ctx = await setupTest();

    const capturedKeyIDs = ctx.started.capture.keys.ids;
    const killed = ctx.nixie.harness.start([{ point, kind: 'erasure' }]);

    await killed.waitForArrival(point);
    await killed.kill();

    const restarted = ctx.nixie.harness.start();

    await restarted.ready;

    const finished = await ctx.nixie.waitForRecord(
      (record) =>
        record.kind === 'erasure.finished' && record.payload['targetID'] === ctx.seed.noteID,
    );

    await restarted.kill();

    const surviving = await readSurvivingKeyIDs(ctx.nixie, capturedKeyIDs);

    expect(capturedKeyIDs.length).toBeGreaterThan(0);
    expect(surviving).toStrictEqual([]);
    expect(finished.payload['removedKeys']).toBe(capturedKeyIDs.length);
  },
);

test.each([
  'erasure.begun',
  'erasure.sandboxes_destroyed',
  'erasure.keys_removed',
  'erasure.cleaned',
  'erasure.turn_inputs_removed',
] as const)(
  'it finishes the memory item forget that nixie was killed during at %s, with every key of the item gone and counted',
  async (point) => {
    const nixie = await startE2ENixie();
    const seed = await seedBegunItemForget(nixie);

    const killed = nixie.harness.start([{ point, kind: 'erasure' }]);

    await killed.waitForArrival(point);
    await killed.kill();

    const restarted = nixie.harness.start();

    await restarted.ready;

    const finished = await nixie.waitForRecord(
      (record) => record.kind === 'erasure.finished' && record.payload['targetID'] === seed.itemID,
    );

    await restarted.kill();

    const state = await readPurgeState(nixie);

    const surviving = state.keyIDs.filter(
      (keyID) => keyID === seed.itemID || keyID.startsWith(`${seed.itemID}/`),
    );

    expect(surviving).toStrictEqual([]);
    expect(finished.payload['removedKeys']).toBe(2);
  },
);
