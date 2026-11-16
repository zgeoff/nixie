import { expect, test } from 'bun:test';
import {
  readPreviousReleaseBuild,
  readPurgeState,
  readPurgedItem,
  seedBegunPurge,
  startSpawnedNixie,
} from '@heynixie/server/test-utils';

async function setupTest() {
  const nixie = await startSpawnedNixie();
  const seed = await seedBegunPurge(nixie, { isOwned: true });

  return { nixie, seed };
}

test.each([
  'record.forget.started',
  'memory.purge.keys_created',
  'memory.purge.closed',
  'memory.purge.keys_removed',
  'record.forget.purged',
] as const)(
  'it finishes the purge of a record forget that nixie was killed during at %s, and the current text still reads',
  async (point) => {
    const ctx = await setupTest();

    const killed = ctx.nixie.harness.start([{ point, kind: 'memory' }]);

    await killed.waitForArrival(point);
    await killed.kill();

    const restarted = ctx.nixie.harness.start();

    await restarted.ready;

    await ctx.nixie.waitForRecord((record) => record.kind === 'record.forgotten');
    await restarted.kill();

    const state = await readPurgeState(ctx.nixie);
    const item = await readPurgedItem(ctx.nixie, ctx.seed.itemID);

    expect(state.purges).toMatchObject([
      {
        record_sequence: ctx.seed.recordSequence,
        item_id: ctx.seed.itemID,
        purged_sequence: expect.toBeNumber(),
      },
    ]);

    expect(state.keyIDs).not.toContain(ctx.seed.itemID);
    expect(item.currentText).toBe('Keeps two hives on the allotment');
    expect(item.versions[0]).toMatchObject({ status: 'shredded', isRemoved: true });
  },
);

test.each([
  'record.forget.started',
  'memory.purge.keys_created',
  'memory.purge.closed',
  'memory.purge.keys_removed',
  'record.forget.purged',
] as const)(
  'it finishes, on a start of the previous release, the purge of a record forget that nixie was killed during at %s',
  async (point) => {
    const ctx = await setupTest();
    const previous = await readPreviousReleaseBuild();

    const killed = ctx.nixie.harness.start([{ point, kind: 'memory' }]);

    await killed.waitForArrival(point);
    await killed.kill();

    const restarted = ctx.nixie.harness.startRelease(previous.testEntry);

    await ctx.nixie.waitForRecord((record) => record.kind === 'record.forgotten');
    await restarted.kill();

    const state = await readPurgeState(ctx.nixie);
    const item = await readPurgedItem(ctx.nixie, ctx.seed.itemID);

    expect(state.purges).toMatchObject([
      {
        record_sequence: ctx.seed.recordSequence,
        item_id: ctx.seed.itemID,
        purged_sequence: expect.toBeNumber(),
      },
    ]);

    expect(state.keyIDs).not.toContain(ctx.seed.itemID);
    expect(item.currentText).toBe('Keeps two hives on the allotment');
    expect(item.versions[0]).toMatchObject({ status: 'shredded', isRemoved: true });
  },
);
