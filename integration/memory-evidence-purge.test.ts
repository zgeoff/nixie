import { expect, test } from 'bun:test';
import type { BegunPurgeSeed } from '@heynixie/server/test-utils';
import { readPurgeState, startInProcessNixie } from '@heynixie/server/test-utils';
import invariant from 'tiny-invariant';

interface PurgeSetup {
  readonly isOwned: boolean;
}

async function setupTest(setup: PurgeSetup) {
  const seeded = Promise.withResolvers<BegunPurgeSeed>();

  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    beforeStart: async (_files, seed) => {
      const begun = await seed.begunPurge(setup);

      seeded.resolve(begun);
    },
  });

  await nixie.waitForLogEvent('ready');

  const seed = await seeded.promise;

  return {
    nixie,
    seed,
    stop: async () => {
      nixie.signalStop();

      const exit = await nixie.waitForExit();

      return exit.records;
    },

    // the kinds a purge writes, from its first record on
    readKinds: (records: readonly { readonly kind: string }[]) =>
      records
        .map((record) => record.kind)
        .slice(records.findIndex((record) => record.kind === 'memory.proposal_lapsed'))
        .filter((kind) =>
          [
            'memory.proposal_lapsed',
            'memory.version_added',
            'memory.version_keyed',
            'memory.evidence_purge_closed',
            'memory.labelled',
            'memory.evidence_purged',
            'record.forgotten',
          ].includes(kind),
        ),
    readState: () => readPurgeState(nixie),
  };
}

test('it finishes a begun purge at the start: the lapse, the bridge, the closing record, the labels, then the last mark, then record.forgotten', async () => {
  const ctx = await setupTest({ isOwned: true });
  const records = await ctx.stop();

  expect(ctx.readKinds(records)).toStrictEqual([
    'memory.proposal_lapsed',
    'memory.version_added',
    'memory.version_keyed',
    'memory.evidence_purge_closed',
    'memory.labelled',
    'memory.evidence_purged',
    'record.forgotten',
  ]);
});

test('it marks the purge closed and purged for the item', async () => {
  const ctx = await setupTest({ isOwned: true });

  await ctx.stop();

  const state = await ctx.readState();

  expect(state.purges).toStrictEqual([
    {
      record_sequence: ctx.seed.recordSequence,
      item_id: ctx.seed.itemID,
      closed_sequence: expect.toBeNumber(),
      purged_sequence: expect.toBeNumber(),
    },
  ]);
});

test('it deletes the closed keys and keeps the next generation key and the bridge key', async () => {
  const ctx = await setupTest({ isOwned: true });

  await ctx.stop();

  const state = await ctx.readState();

  const keyIDs = state.keyIDs;

  expect(keyIDs.filter((keyID) => keyID === ctx.seed.itemID)).toStrictEqual([]);
  expect(keyIDs.filter((keyID) => keyID.startsWith(`${ctx.seed.itemID}/`))).toHaveLength(2);
});

test('it writes nothing when nixie starts again over a finished purge', async () => {
  const ctx = await setupTest({ isOwned: true });
  const first = await ctx.stop();

  const again = ctx.nixie.startAgain();

  await again.waitForLogEvent('ready');

  again.signalStop();

  const exit = await again.waitForExit();

  expect(ctx.readKinds(exit.records)).toStrictEqual(ctx.readKinds(first));
});

test('it finishes a purge that no record forget owns, and writes no record.forgotten', async () => {
  const ctx = await setupTest({ isOwned: false });
  const records = await ctx.stop();

  invariant(records.length > 0);

  expect(ctx.readKinds(records)).toStrictEqual([
    'memory.proposal_lapsed',
    'memory.version_added',
    'memory.version_keyed',
    'memory.evidence_purge_closed',
    'memory.labelled',
    'memory.evidence_purged',
  ]);
});
