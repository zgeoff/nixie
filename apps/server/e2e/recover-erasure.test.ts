import { expect, test } from 'bun:test';
import { readPurgeState, seedBegunNoteForget, startE2ENixie } from '@heynixie/server/test-utils';
import { z } from 'zod';

async function setupTest() {
  const nixie = await startE2ENixie();
  const seed = await seedBegunNoteForget(nixie);

  return { nixie, seed };
}

test.each([
  'erasure.started',
  'erasure.sandboxes_destroyed',
  'erasure.keys_removed',
  'erasure.cleaned',
  'erasure.turn_inputs_removed',
] as const)(
  'it finishes the note forget that nixie was killed during at %s, with no key of the note left',
  async (point) => {
    const ctx = await setupTest();

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

    const state = await readPurgeState(ctx.nixie);

    const removed = z.object({ removedKeys: z.number() }).parse(finished.payload);

    expect(state.keyIDs.filter((keyID) => keyID.includes(ctx.seed.noteID))).toStrictEqual([]);
    expect(removed.removedKeys).toBeGreaterThanOrEqual(0);
  },
);
