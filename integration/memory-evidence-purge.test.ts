import { expect, test } from 'bun:test';
import type { BegunPurgeSeed } from '@heynixie/server/test-utils';
import { readPurgeState, readPurgedItem, startInProcessNixie } from '@heynixie/server/test-utils';
import invariant from 'tiny-invariant';

interface PurgeSetup {
  readonly isOwned: boolean;
  readonly isSharedKey?: boolean;
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
    readItem: () => readPurgedItem(nixie, seed.itemID),
  };
}

test('it finishes a begun purge at the start: the lapse, the closing record, the labels, then the last mark, then record.forgotten', async () => {
  const ctx = await setupTest({ isOwned: true });
  const records = await ctx.stop();

  expect(ctx.readKinds(records)).toStrictEqual([
    'memory.proposal_lapsed',
    'memory.evidence_purge_closed',
    'memory.labelled',
    'memory.evidence_purged',
    'record.forgotten',
  ]);
});

test('it writes the bridge version of a shared-key item before the closing record', async () => {
  const ctx = await setupTest({ isOwned: true, isSharedKey: true });
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

test('it deletes the closed keys and keeps the next generation key and the current version key', async () => {
  const ctx = await setupTest({ isOwned: true });

  await ctx.stop();

  const state = await ctx.readState();

  const keyIDs = state.keyIDs;

  expect(keyIDs.filter((keyID) => keyID === ctx.seed.itemID)).toStrictEqual([]);
  expect(keyIDs.filter((keyID) => keyID.startsWith(`${ctx.seed.itemID}/`))).toHaveLength(2);
});

test('it keeps the current text and labels readable and reads the older version as removed', async () => {
  const ctx = await setupTest({ isOwned: true });

  await ctx.stop();

  const item = await ctx.readItem();

  expect(item).toStrictEqual({
    currentText: 'Keeps two hives on the allotment',
    versions: [
      { version: 1, status: 'shredded', isRemoved: true, isBridge: false },
      { version: 2, status: 'readable', isRemoved: false, isBridge: false },
    ],
    labels: { gist: 'keeps bees', topic: 'garden', triggers: ['bees'] },
  });
});

test('it shows the bridge version of a shared-key item as a bridge, and the older versions as removed', async () => {
  const ctx = await setupTest({ isOwned: true, isSharedKey: true });

  await ctx.stop();

  const item = await ctx.readItem();

  expect(item.versions).toStrictEqual([
    { version: 1, status: 'shredded', isRemoved: true, isBridge: false },
    { version: 2, status: 'shredded', isRemoved: true, isBridge: false },
    { version: 3, status: 'readable', isRemoved: false, isBridge: true },
  ]);
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
    'memory.evidence_purge_closed',
    'memory.labelled',
    'memory.evidence_purged',
  ]);
});
