import { expect, test } from 'bun:test';
import { nixieSchema } from '@heynixie/db';
import {
  readPreviousReleaseBuild,
  readPurgeState,
  readPurgedItem,
  seedBegunPurge,
  startE2ENixie,
} from '@heynixie/server/test-utils';
import { probePreviousReleaseReadable } from '../src/test-utils/probe-previous-release-readable';

// skipIf decides before any test runs, so the read happens once at load. A release that opens
// this build's data finishes the purge itself; an older one refuses the data.
const isPreviousReleaseReadable = await probePreviousReleaseReadable();

async function setupTest() {
  const nixie = await startE2ENixie();
  const seed = await seedBegunPurge(nixie, { isOwned: true });

  return { nixie, seed };
}

test.each([
  'erasure.begun',
  'memory.purge.keys_created',
  'memory.purge.closed',
  'memory.purge.keys_removed',
  'erasure.cleaned',
] as const)(
  'it finishes the purge of a record forget that nixie was killed during at %s, and the current text still reads',
  async (point) => {
    const ctx = await setupTest();

    const killed = ctx.nixie.harness.start([
      { point, kind: point.startsWith('memory') ? 'memory' : 'erasure' },
    ]);

    await killed.waitForArrival(point);
    await killed.kill();

    const restarted = ctx.nixie.harness.start();

    await restarted.ready;

    await ctx.nixie.waitForRecord((record) => record.kind === 'erasure.finished');
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

test.skipIf(!isPreviousReleaseReadable)(
  'it marks purged, on the next start after the previous release ended the record forget, an item whose own forget nixie was killed during',
  async () => {
    const nixie = await startE2ENixie();
    const seed = await seedBegunPurge(nixie, { isOwned: true, isItemForgetting: true });
    const previous = await readPreviousReleaseBuild();

    const killed = nixie.harness.start([{ point: 'erasure.keys_removed', kind: 'erasure' }]);

    await killed.waitForArrival('erasure.keys_removed');
    await killed.kill();

    const rolledBack = nixie.harness.startRelease(previous.testEntry, previous.imageKeys);

    await nixie.waitForRecord((record) => record.kind === 'erasure.finished');
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
  },
);

test
  .skipIf(!isPreviousReleaseReadable)
  .each([
    'erasure.begun',
    'memory.purge.keys_created',
    'memory.purge.closed',
    'memory.purge.keys_removed',
    'erasure.cleaned',
  ] as const)(
  'it finishes, on a start of the previous release, the purge of a record forget that nixie was killed during at %s',
  async (point) => {
    const ctx = await setupTest();
    const previous = await readPreviousReleaseBuild();

    const killed = ctx.nixie.harness.start([
      { point, kind: point.startsWith('memory') ? 'memory' : 'erasure' },
    ]);

    await killed.waitForArrival(point);
    await killed.kill();

    const restarted = ctx.nixie.harness.startRelease(previous.testEntry, previous.imageKeys);

    await ctx.nixie.waitForRecord((record) => record.kind === 'erasure.finished');
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

test.skipIf(isPreviousReleaseReadable)(
  'it refuses a start of the previous release on a record forget that nixie was killed during, naming the schema and a backup restore, and the next start finishes the purge',
  async () => {
    const ctx = await setupTest();
    const previous = await readPreviousReleaseBuild();

    const killed = ctx.nixie.harness.start([{ point: 'memory.purge.closed', kind: 'memory' }]);

    await killed.waitForArrival('memory.purge.closed');
    await killed.kill();

    const rolledBack = ctx.nixie.harness.startRelease(previous.testEntry, previous.imageKeys);

    const rolledBackRun = await rolledBack.waitForExit();

    const restarted = ctx.nixie.harness.start();

    await restarted.ready;

    await ctx.nixie.waitForRecord((record) => record.kind === 'erasure.finished');
    await restarted.kill();

    const state = await readPurgeState(ctx.nixie);

    const refusal = new RegExp(
      `database schema ${String(nixieSchema.migrations.length)} needs a build that writes schema ${String(nixieSchema.oldestReader)} or later, and this build writes schema \\d+: .*restore a backup`,
      'u',
    );

    expect({
      hasFailed: rolledBackRun.exit.code !== 0,
      output: rolledBack.readOutput(),
    }).toStrictEqual({ hasFailed: true, output: expect.stringMatching(refusal) });

    expect(state.purges).toMatchObject([
      {
        record_sequence: ctx.seed.recordSequence,
        item_id: ctx.seed.itemID,
        purged_sequence: expect.toBeNumber(),
      },
    ]);
  },
);
