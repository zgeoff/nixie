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

test('it marks purged, on the next start after the previous release ended the record forget, an item whose own forget nixie was killed during', async () => {
  const nixie = await startSpawnedNixie();
  const seed = await seedBegunPurge(nixie, { isOwned: true, isItemForgetting: true });
  const previous = await readPreviousReleaseBuild();

  const killed = nixie.harness.start([{ point: 'memory.forget.key_removed', kind: 'memory' }]);

  await killed.waitForArrival('memory.forget.key_removed');
  await killed.kill();

  const rolledBack = nixie.harness.startRelease(previous.testEntry);

  await nixie.waitForRecord((record) => record.kind === 'record.forgotten');
  await rolledBack.kill();

  const rolledBackState = await readPurgeState(nixie);

  const restarted = nixie.harness.start();

  await restarted.ready;

  await nixie.waitForRecord((record) => record.kind === 'memory.evidence_purged');
  await restarted.kill();

  const state = await readPurgeState(nixie);

  expect(
    rolledBackState.keyIDs.filter(
      (keyID) => keyID === seed.itemID || keyID.startsWith(`${seed.itemID}/`),
    ),
  ).toStrictEqual([]);

  expect(state.purges).toStrictEqual([
    {
      record_sequence: seed.recordSequence,
      item_id: seed.itemID,
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
