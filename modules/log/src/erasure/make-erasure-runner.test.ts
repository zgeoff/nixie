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
    onRevoke?: (targetID: string) => Promise<void>,
  ) =>
    runner.register(
      buildTestErasable({
        kind,
        childKind,
        targets,
        events,
        ...(onRevoke === undefined ? {} : { onRevoke }),
      }),
    );

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
  'erasure.begun',
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
    'writeBackupFloor',
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
    finishedTargets: ['i2', 'i1', 'p'],
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

test('it reports the keys it deleted when a crash after the keys cut the run short', async () => {
  const ctx = await setupTest();

  const keyIDs = [await ctx.createKey(), await ctx.createKey()];
  const note = ctx.register('note', 'image', [{ id: 'a', keyIDs, childIDs: [] }]);

  await note.begin({ id: 'a' }, { by: 'user' });

  ctx.crashAt('erasure.keys_removed');

  await note.finish('a').catch(() => null);
  await ctx.runner.finishOpen();

  const records = await ctx.readErasureRecords();

  expect(records[1]?.payload).toMatchObject({ kind: 'note', targetID: 'a', removedKeys: 2 });
});

test('it runs one forget once when two retries of it run at the same time', async () => {
  const ctx = await setupTest();

  const note = ctx.register('note', 'image', [{ id: 'a', keyIDs: [], childIDs: [] }]);

  await note.begin({ id: 'a' }, { by: 'user' });
  await Promise.all([note.finish('a'), note.finish('a')]);

  const names = ctx.calls.map((call) => call.split(' ')[0]);

  expect(names.filter((name) => name === 'cleanupSessions')).toHaveLength(1);
  expect(names.filter((name) => name === 'releaseCaptures')).toHaveLength(1);
});

test('it finishes a child that another forget started before the parent that reaches it', async () => {
  const ctx = await setupTest();

  const record = ctx.register('record', 'image', [{ id: 'p', keyIDs: [], childIDs: ['i1'] }]);
  const image = ctx.register('image', 'image', [{ id: 'i1', keyIDs: [], childIDs: [] }]);

  await record.begin({ id: 'p' }, { by: 'user' });
  await image.begin({ id: 'i1' }, { by: 'user' });
  await record.finish('p');

  const records = await ctx.readErasureRecords();

  expect(
    records
      .filter((entry) => entry.kind === 'erasure.finished')
      .map((entry) => entry.payload['targetID']),
  ).toStrictEqual(['i1', 'p']);
});

test('it reads a child again when it changed after it was read, and deletes its keys before the parent finishes', async () => {
  const ctx = await setupTest();
  const childKey = await ctx.createKey();

  const reads = { count: 0 };

  const child = buildTestErasable({
    kind: 'image',
    childKind: 'image',
    targets: [{ id: 'i1', keyIDs: [childKey], childIDs: [], version: 2 }],
    events: ctx.events,
  });

  ctx.runner.register({
    ...child,
    toRequest: (target) =>
      target.version === null
        ? { id: target.targetID }
        : { id: target.targetID, version: target.version },
  });

  const parent = buildTestErasable({
    kind: 'record',
    childKind: 'image',
    targets: [{ id: 'p', keyIDs: [], childIDs: ['i1'] }],
    events: ctx.events,
  });

  const handle = ctx.runner.register({
    ...parent,
    readChildren: () => {
      reads.count += 1;

      return Promise.resolve([
        { kind: 'image', targetID: 'i1', version: reads.count === 1 ? 1 : 2 },
      ]);
    },
  });

  await handle.begin({ id: 'p' }, { by: 'user' });
  await handle.finish('p');

  const remaining = await ctx.readKeyIDs();
  const records = await ctx.readErasureRecords();

  expect({
    remaining,
    finished: records
      .filter((entry) => entry.kind === 'erasure.finished')
      .map((entry) => entry.payload['targetID']),
  }).toStrictEqual({ remaining: [], finished: ['i1', 'p'] });
});

test('it runs again an erasure open past the stuck threshold, and leaves a younger one alone', async () => {
  const ctx = await setupTest();

  const note = ctx.register('note', 'image', [{ id: 'a', keyIDs: [], childIDs: [] }]);

  await note.begin({ id: 'a' }, { by: 'user' });

  const startedAtMs = ctx.clock.now();

  const young = await ctx.runner.retryStuck({ nowMs: startedAtMs + 1000, stuckAfterMs: 5000 });
  const openAfterYoung = await ctx.readOpenCount();
  const old = await ctx.runner.retryStuck({ nowMs: startedAtMs + 5000, stuckAfterMs: 5000 });
  const openAfterOld = await ctx.readOpenCount();

  expect({ young, openAfterYoung, old, openAfterOld }).toStrictEqual({
    young: { stillOpen: [], failures: [] },
    openAfterYoung: 1,
    old: { stillOpen: [], failures: [] },
    openAfterOld: 0,
  });
});

test('it reports an erasure that stays open after its retry fails', async () => {
  const ctx = await setupTest();

  const note = ctx.register('note', 'image', [{ id: 'a', keyIDs: [], childIDs: [] }]);

  await note.begin({ id: 'a' }, { by: 'user' });

  ctx.crashAt('erasure.cleaned');

  const startedAtMs = ctx.clock.now();

  const retry = await ctx.runner.retryStuck({ nowMs: startedAtMs + 5000, stuckAfterMs: 5000 });

  expect({
    stillOpen: retry.stillOpen.map((erasure) => [erasure.kind, erasure.shortID, erasure.openForMs]),
    failureCount: retry.failures.length,
  }).toStrictEqual({ stillOpen: [['note', 'short-a', 5000]], failureCount: 1 });
});

test('it reads the erasures open past the stuck threshold without running any', async () => {
  const ctx = await setupTest();

  const note = ctx.register('note', 'image', [{ id: 'a', keyIDs: [], childIDs: [] }]);

  await note.begin({ id: 'a' }, { by: 'user' });

  const startedAtMs = ctx.clock.now();

  const young = await ctx.runner.readStuck({ nowMs: startedAtMs + 1000, stuckAfterMs: 5000 });
  const old = await ctx.runner.readStuck({ nowMs: startedAtMs + 5000, stuckAfterMs: 5000 });
  const openAfter = await ctx.readOpenCount();

  expect({
    young,
    old: old.map((erasure) => [erasure.kind, erasure.shortID, erasure.openForMs]),
    openAfter,
  }).toStrictEqual({ young: [], old: [['note', 'short-a', 5000]], openAfter: 1 });
});

test('it runs the revoke step with every key still in place, and deletes the keys after it', async () => {
  const ctx = await setupTest();

  const keyIDs = [await ctx.createKey(), await ctx.createKey()];
  const keysAtRevoke: number[] = [];

  const credential = ctx.register(
    'credential',
    'image',
    [{ id: 'a', keyIDs, childIDs: [] }],
    async () => {
      const keys = await ctx.readKeyIDs();

      keysAtRevoke.push(keys.length);
    },
  );

  await credential.begin({ id: 'a' }, { by: 'user' });
  await credential.finish('a');

  const keysAfter = await ctx.readKeyIDs();

  expect([keysAtRevoke, keysAfter]).toStrictEqual([[2], []]);
});

test('it keeps the keys and leaves the forget open when the revoke step fails', async () => {
  const ctx = await setupTest();

  const keyIDs = [await ctx.createKey()];

  const credential = ctx.register('credential', 'image', [{ id: 'a', keyIDs, childIDs: [] }], () =>
    Promise.reject(new Error('the record write failed')),
  );

  await credential.begin({ id: 'a' }, { by: 'user' });
  await Promise.allSettled([credential.finish('a')]);

  const keysAfter = await ctx.readKeyIDs();
  const open = await ctx.readOpenCount();

  expect([keysAfter, open]).toStrictEqual([keyIDs, 1]);
});

test('it reaches the revoked fault point after the revoke step and before the keys go', async () => {
  const ctx = await setupTest();

  const keyIDs = [await ctx.createKey()];

  const credential = ctx.register('credential', 'image', [{ id: 'a', keyIDs, childIDs: [] }], () =>
    Promise.resolve(),
  );

  ctx.crashAt('erasure.revoked');

  await credential.begin({ id: 'a' }, { by: 'user' });
  await Promise.allSettled([credential.finish('a')]);

  const keysAfter = await ctx.readKeyIDs();

  expect(keysAfter).toStrictEqual(keyIDs);
});
