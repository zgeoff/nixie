import { expect, test } from 'bun:test';
import { createRecordKey } from '../record/create-record-key';
import { parseJSONObject } from '../record/parse-json-object';
import { buildTestErasable } from '../test-utils/build-test-erasable';
import type { TestErasureTarget } from '../test-utils/build-test-erasable';
import { buildTestErasureEffects } from '../test-utils/build-test-erasure-effects';
import { readTestRecordKeyRows } from '../test-utils/read-test-record-key-rows';
import { readTestRecordRows } from '../test-utils/read-test-record-rows';
import { startTestLog } from '../test-utils/start-test-log';
import type { ErasableKind } from './erasable-kind';
import type { ErasureFaultPoint } from './erasure-effects';
import { makeErasureRunner } from './make-erasure-runner';
import { readOpenErasures } from './read-open-erasures';

async function setupTest() {
  const testLog = await startTestLog();

  const fake = buildTestErasureEffects();
  const events: string[] = [];

  const runner = makeErasureRunner({
    log: testLog.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    effects: fake.effects,
  });

  const register = (
    kind: ErasableKind,
    childKind: ErasableKind,
    targets: readonly TestErasureTarget[],
  ) => runner.register(buildTestErasable({ kind, childKind, targets, events }));

  return {
    ...testLog,
    ...fake,
    events,
    runner,
    register,
    createKey: async () => {
      const created = await createRecordKey(testLog.log);

      return created.keyID;
    },
    readKeyIDs: async () => {
      const rows = await readTestRecordKeyRows(testLog.writer);

      return rows.map((row) => row.key_id);
    },
    readErasureRecords: async () => {
      const rows = await readTestRecordRows(testLog.writer);

      return rows
        .filter((row) => row.kind.startsWith('erasure.'))
        .map((row) => ({ kind: row.kind, payload: parseJSONObject(row.payload) }));
    },
    readOpenCount: async () => {
      const open = await readOpenErasures(testLog.log);

      return open.length;
    },
  };
}

test('it writes erasure.started, deletes the keys, then writes erasure.finished', async () => {
  const ctx = await setupTest();

  const keyIDs = [await ctx.createKey(), await ctx.createKey()];
  const note = ctx.register('note', 'image', [{ id: 'a', keyIDs, childIDs: [] }]);

  await note.begin({ id: 'a' }, { by: 'user' });
  await note.finish('a');

  const records = await ctx.readErasureRecords();
  const remaining = await ctx.readKeyIDs();

  expect({ kinds: records.map((record) => record.kind), remaining }).toStrictEqual({
    kinds: ['erasure.started', 'erasure.finished'],
    remaining: [],
  });

  expect(records[1]?.payload).toMatchObject({ kind: 'note', targetID: 'a', removedKeys: 2 });
});

test('it leaves the keys gone and no erasure.finished when a step after the keys fails', async () => {
  const ctx = await setupTest();

  const keyIDs = [await ctx.createKey()];
  const note = ctx.register('note', 'image', [{ id: 'a', keyIDs, childIDs: [] }]);

  await note.begin({ id: 'a' }, { by: 'user' });

  ctx.crashAt('erasure.cleaned');

  const [attempt] = await Promise.allSettled([note.finish('a')]);
  const records = await ctx.readErasureRecords();
  const remaining = await ctx.readKeyIDs();

  expect({
    isRejected: attempt?.status === 'rejected',
    kinds: records.map((record) => record.kind),
    remaining,
  }).toStrictEqual({ isRejected: true, kinds: ['erasure.started'], remaining: [] });
});

test.each<ErasureFaultPoint>([
  'erasure.started',
  'erasure.sandboxes_destroyed',
  'erasure.keys_removed',
  'erasure.cleaned',
  'erasure.turn_inputs_removed',
])('it finishes at the next start an erasure that a crash at %s cut short', async (point) => {
  const ctx = await setupTest();

  const keyIDs = [await ctx.createKey(), await ctx.createKey()];
  const note = ctx.register('note', 'image', [{ id: 'a', keyIDs, childIDs: [] }]);

  ctx.crashAt(point);

  await note.begin({ id: 'a' }, { by: 'user' }).catch(() => null);
  await note.finish('a').catch(() => null);
  await ctx.runner.finishOpen();

  const records = await ctx.readErasureRecords();
  const remaining = await ctx.readKeyIDs();

  expect({ kinds: records.map((record) => record.kind), remaining }).toStrictEqual({
    kinds: ['erasure.started', 'erasure.finished'],
    remaining: [],
  });
});

test('it holds capture closed from the first step to the last and releases it before it finishes', async () => {
  const ctx = await setupTest();

  const note = ctx.register('note', 'image', [{ id: 'a', keyIDs: [], childIDs: [] }]);

  await note.begin({ id: 'a' }, { by: 'user' });
  await note.finish('a');

  expect(ctx.calls.map((call) => call.split(' ')[0])).toStrictEqual([
    'holdCaptures',
    'closeCaptures',
    'destroySandboxes',
    'cleanupSessions',
    'removeTurnInputs',
    'releaseCaptures',
  ]);
});

test('it finishes each child before its parent, with the keys of the whole tree gone first', async () => {
  const ctx = await setupTest();
  const parentKey = await ctx.createKey();
  const firstKey = await ctx.createKey();
  const secondKey = await ctx.createKey();

  const record = ctx.register('record', 'image', [
    { id: 'p', keyIDs: [parentKey], childIDs: ['i1', 'i2'] },
  ]);

  ctx.register('image', 'image', [
    { id: 'i1', keyIDs: [firstKey], childIDs: ['i2'] },
    { id: 'i2', keyIDs: [secondKey], childIDs: [] },
  ]);

  await record.begin({ id: 'p' }, { by: 'user' });

  ctx.crashAt('erasure.cleaned');

  await record.finish('p').catch(() => null);

  const keysAtCrash = await ctx.readKeyIDs();
  const recordsAtCrash = await ctx.readErasureRecords();

  await record.finish('p');

  const records = await ctx.readErasureRecords();

  const finished = records
    .filter((entry) => entry.kind === 'erasure.finished')
    .map((entry) => entry.payload);

  expect({
    keysAtCrash,
    startedAtCrash: recordsAtCrash.length,
    finishedTargets: finished.map((payload) => payload['targetID']),
  }).toStrictEqual({
    keysAtCrash: [],
    startedAtCrash: 3,
    finishedTargets: ['i1', 'i2', 'p'],
  });
});

test('it finishes a child that two parents reach, and a cycle, once', async () => {
  const ctx = await setupTest();

  const record = ctx.register('record', 'image', [{ id: 'p', keyIDs: [], childIDs: ['i1'] }]);

  ctx.register('image', 'record', [{ id: 'i1', keyIDs: [], childIDs: ['p'] }]);

  await record.begin({ id: 'p' }, { by: 'user' });
  await record.finish('p');

  const records = await ctx.readErasureRecords();

  expect(records.map((entry) => entry.kind)).toStrictEqual([
    'erasure.started',
    'erasure.started',
    'erasure.finished',
    'erasure.finished',
  ]);
});

test('it answers a refusal as a value and writes no record', async () => {
  const ctx = await setupTest();

  const note = ctx.register('note', 'image', [{ id: 'a', keyIDs: [], childIDs: [], version: 2 }]);

  const missing = await note.begin({ id: 'b' }, { by: 'user' });
  const stale = await note.begin({ id: 'a', version: 1 }, { by: 'user' });
  const records = await ctx.readErasureRecords();

  expect({ missing, stale, records }).toStrictEqual({
    missing: { status: 'refused', reason: 'not_found' },
    stale: { status: 'refused', reason: 'stale' },
    records: [],
  });
});

test('it rolls the start back when the caller hook throws', async () => {
  const ctx = await setupTest();

  const note = ctx.register('note', 'image', [{ id: 'a', keyIDs: [], childIDs: [] }]);

  const [attempt] = await Promise.allSettled([
    note.begin(
      { id: 'a' },
      {
        by: 'user',
        writeInTransaction: () => Promise.reject(new Error('already settled')),
      },
    ),
  ]);

  const records = await ctx.readErasureRecords();

  expect({ isRejected: attempt?.status === 'rejected', records }).toStrictEqual({
    isRejected: true,
    records: [],
  });
});

test('it starts and finishes a forget that the old pipeline left open', async () => {
  const ctx = await setupTest();

  const events: string[] = [];

  const legacy = {
    ...buildTestErasable({
      kind: 'note',
      childKind: 'image',
      targets: [{ id: 'a', keyIDs: [], childIDs: [] }],
      events,
    }),
    readLegacyOpen: () => Promise.resolve([{ request: { id: 'a' }, by: 'assistant' as const }]),
  };

  ctx.runner.register(legacy);

  await ctx.runner.finishOpen();

  const records = await ctx.readErasureRecords();

  expect(records.map((entry) => [entry.kind, entry.payload['by']])).toStrictEqual([
    ['erasure.started', 'assistant'],
    ['erasure.finished', 'assistant'],
  ]);
});

test('it leaves nothing open after a finished erasure', async () => {
  const ctx = await setupTest();

  const note = ctx.register('note', 'image', [{ id: 'a', keyIDs: [], childIDs: [] }]);

  await note.begin({ id: 'a' }, { by: 'user' });
  await note.finish('a');
  await note.finish('a');

  const open = await ctx.readOpenCount();

  expect(open).toBe(0);
});
