import { expect, test } from 'bun:test';
import {
  readPreviousReleaseBuild,
  readPurgeState,
  readPurgedItem,
  seedBegunPurge,
  startSpawnedNixie,
} from '@heynixie/server/test-utils';

async function setupTest(isItemForgetting = false) {
  const nixie = await startSpawnedNixie();
  const seed = await seedBegunPurge(nixie, { isOwned: true, isItemForgetting });

  return {
    nixie,
    seed,

    // A release before the task.yaml text migration writes schema 69, and the migrated data needs
    // a build that writes schema 70, so it refuses with the schema and the way back: restore a backup.
    expectRefusalNamingRollback: async (
      previous: ReturnType<typeof nixie.harness.startRelease>,
    ) => {
      const run = await previous.waitForExit();

      expect({ hasFailed: run.exit.code !== 0, output: previous.readOutput() }).toStrictEqual({
        hasFailed: true,
        output: expect.stringMatching(
          /database schema 70 needs a build that writes schema 70 or later, and this build writes schema 69: no copy of schema 69 or older sits in \S+, so restore a backup/u,
        ),
      });
    },
  };
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

test('it marks purged, on the next start after the previous release refused the migrated data, an item whose own forget nixie was killed during', async () => {
  const ctx = await setupTest(true);
  const previous = await readPreviousReleaseBuild();

  const killed = ctx.nixie.harness.start([{ point: 'memory.forget.key_removed', kind: 'memory' }]);

  await killed.waitForArrival('memory.forget.key_removed');
  await killed.kill();
  await ctx.expectRefusalNamingRollback(ctx.nixie.harness.startRelease(previous.testEntry));

  const restarted = ctx.nixie.harness.start();

  await restarted.ready;

  await ctx.nixie.waitForRecord((record) => record.kind === 'memory.evidence_purged');
  await restarted.kill();

  const state = await readPurgeState(ctx.nixie);

  expect(
    state.keyIDs.filter(
      (keyID) => keyID === ctx.seed.itemID || keyID.startsWith(`${ctx.seed.itemID}/`),
    ),
  ).toStrictEqual([]);

  expect(state.purges).toStrictEqual([
    {
      record_sequence: ctx.seed.recordSequence,
      item_id: ctx.seed.itemID,
      closed_sequence: null,
      purged_sequence: expect.toBeNumber(),
    },
  ]);
});

test.each([
  'record.forget.started',
  'memory.purge.keys_created',
  'memory.purge.closed',
  'memory.purge.keys_removed',
  'record.forget.purged',
] as const)(
  'it refuses a start of the previous release, and the next start finishes the purge of a record forget that nixie was killed during at %s',
  async (point) => {
    const ctx = await setupTest();
    const previous = await readPreviousReleaseBuild();

    const killed = ctx.nixie.harness.start([{ point, kind: 'memory' }]);

    await killed.waitForArrival(point);
    await killed.kill();
    await ctx.expectRefusalNamingRollback(ctx.nixie.harness.startRelease(previous.testEntry));

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
