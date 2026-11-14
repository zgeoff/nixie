import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BackupReceipt } from '@heynixie/wire';
import { formatBackupFile } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { localJobFiles } from '../local-job-files';
import { buildResticClient } from '../restic/build-restic-client';
import { runJobPass } from '../run-job-pass';
import { createStagedSet } from '../test-utils/create-staged-set';
import { createStubRestic } from '../test-utils/create-stub-restic';
import type { BackupRepository } from './backup-repository';
import { pickNewestKey } from './pick-newest-key';
import type { BackupRepos } from './publish-backup-set';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-publish-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const restic = await createStubRestic(directory);

  const calls = join(directory, 'restic-calls.jsonl');
  const dataRepository = join(directory, 'repos', 'data');
  const keyRepository = join(directory, 'repos', 'keys');

  const config = {
    stagingDir: join(directory, 'backup'),
    restic,
    backendEnv: { STUB_RESTIC_LOG: calls },
    retention: { hourly: 24, daily: 7, weekly: 4, monthly: 6 },
  };

  const buildClients = (failingKeyStep: string, failingDataStep: string) => ({
    data: buildResticClient(
      { restic, backendEnv: { STUB_RESTIC_FAIL: failingDataStep } },
      { repository: dataRepository, password: 'data-pass' },
      'data',
    ),
    keys: buildResticClient(
      { restic, backendEnv: { STUB_RESTIC_FAIL: failingKeyStep } },
      { repository: keyRepository, password: 'key-pass' },
      'key',
    ),
  });

  const repos = {
    data: buildResticClient(config, { repository: dataRepository, password: 'data-pass' }, 'data'),
    keys: buildResticClient(config, { repository: keyRepository, password: 'key-pass' }, 'key'),
  };

  const writeTaggedSnapshot = async (repo: BackupRepository, tags: readonly string[]) => {
    const path = join(directory, 'seed.db');

    await writeFile(path, `seed ${tags.join(' ')}`);

    await repo.createRepository();
    await repo.writeSnapshot(path, 'keys.db', tags);
  };

  const stageSet = (sequence: number) =>
    createStagedSet({
      stagingDir: config.stagingDir,
      sequence,
      kind: 'scheduled',
      isComplete: true,
    });

  const notePath = join(config.stagingDir, 'restore-note.json');

  const writeNote = (keySnapshotID: string | null) =>
    writeFile(
      notePath,
      formatBackupFile({ format: 1, restoredAt: 1_798_761_600_000, keySnapshotID }),
    );

  const runPass = async (
    passRepos: BackupRepos,
    files = localJobFiles,
  ): Promise<readonly BackupReceipt[]> => {
    const pass = await runJobPass(config, passRepos, files);

    invariant(pass.status === 'ran', 'no other pass holds the staging lock');

    return pass.receipts;
  };

  const readBothRepos = async () => {
    await repos.keys.createRepository();
    await repos.data.createRepository();

    return { keys: await repos.keys.readSnapshots(), data: await repos.data.readSnapshots() };
  };

  return {
    repos,
    readBothRepos,
    calls,
    notePath,
    dataRepository,
    keyRepository,
    config,
    buildClients,
    writeTaggedSnapshot,
    stageSet,
    writeNote,
    runPass,
    probeNote: () => Bun.file(notePath).exists(),
  };
}

test('it tags the first publish of both repos, and writes the key snapshot first', async () => {
  const ctx = await setupTest();

  await ctx.stageSet(1);
  await ctx.runPass(ctx.repos);

  const keys = await ctx.repos.keys.readSnapshots();
  const data = await ctx.repos.data.readSnapshots();
  const calls = await Bun.file(ctx.calls).text();

  const backupRepositories = calls
    .split('\n')
    .filter((line) => line.includes('"backup"'))
    .map((line) => (line.includes(ctx.keyRepository) ? 'keys' : 'data'));

  expect(keys).toStrictEqual([
    {
      snapshotID: expect.any(String),
      writtenAt: expect.any(Number),
      set: 1,
      kind: 'scheduled',
      publish: 1,
      legacySet: null,
      provenFrom: null,
    },
  ]);

  expect(data).toStrictEqual([
    {
      snapshotID: expect.any(String),
      writtenAt: expect.any(Number),
      set: 1,
      kind: 'scheduled',
      publish: 1,
      legacySet: null,
      provenFrom: null,
    },
  ]);

  expect(keys[0]?.writtenAt).toBeLessThanOrEqual(data[0]?.writtenAt ?? 0);
  expect(backupRepositories).toStrictEqual(['keys', 'data']);
});

test('it numbers a second publish and copies legacy-set and proven-from from the first', async () => {
  const ctx = await setupTest();

  await ctx.writeTaggedSnapshot(ctx.repos.keys, [
    'set-4',
    'kind-scheduled',
    'publish-3',
    'legacy-set-2',
    'proven-from-3',
  ]);

  await ctx.stageSet(5);
  await ctx.runPass(ctx.repos);

  const keys = await ctx.repos.keys.readSnapshots();

  expect(keys).toStrictEqual([
    expect.objectContaining({ set: 5, publish: 4, legacySet: 2, provenFrom: 3 }),
  ]);
});

test('it gives the first numbered publish the legacy-set of the unnumbered key snapshot it replaces', async () => {
  const ctx = await setupTest();

  await ctx.writeTaggedSnapshot(ctx.repos.keys, ['set-5', 'kind-scheduled']);
  await ctx.stageSet(6);
  await ctx.runPass(ctx.repos);

  const keys = await ctx.repos.keys.readSnapshots();

  expect(keys).toStrictEqual([
    expect.objectContaining({ set: 6, publish: 1, legacySet: 5, provenFrom: null }),
  ]);
});

test('it raises proven-from when the unnumbered key snapshot is older than a data publish number', async () => {
  const ctx = await setupTest();

  await ctx.writeTaggedSnapshot(ctx.repos.data, ['set-8', 'kind-scheduled', 'publish-3']);
  await ctx.writeTaggedSnapshot(ctx.repos.keys, ['set-9', 'kind-scheduled']);
  await ctx.stageSet(10);
  await ctx.runPass(ctx.repos);

  const keys = await ctx.repos.keys.readSnapshots();

  expect(keys).toStrictEqual([
    expect.objectContaining({ set: 10, publish: 4, legacySet: 9, provenFrom: 4 }),
  ]);
});

test('it counts from the highest publish number of either repo', async () => {
  const ctx = await setupTest();

  await ctx.writeTaggedSnapshot(ctx.repos.data, ['set-7', 'kind-scheduled', 'publish-7']);
  await ctx.writeTaggedSnapshot(ctx.repos.keys, ['set-6', 'kind-scheduled', 'publish-6']);
  await ctx.stageSet(8);
  await ctx.runPass(ctx.repos);

  const data = await ctx.repos.data.readSnapshots();
  const keys = await ctx.repos.keys.readSnapshots();

  expect(data.map((snapshot) => snapshot.publish)).toIncludeSameMembers([7, 8]);
  expect(keys.map((snapshot) => snapshot.publish)).toStrictEqual([8]);
});

test('it writes no data snapshot and removes no key snapshot when the key snapshot fails', async () => {
  const ctx = await setupTest();

  await ctx.stageSet(1);
  await ctx.runPass(ctx.repos);
  await ctx.stageSet(2);
  await ctx.writeNote(null);

  const failing = ctx.buildClients('backup', '');

  const receipts = await ctx.runPass({ data: ctx.repos.data, keys: failing.keys });
  const keys = await ctx.repos.keys.readSnapshots();
  const hasNote = await ctx.probeNote();
  const afterwards = await ctx.readBothRepos();

  expect(receipts).toStrictEqual([
    expect.objectContaining({
      sequence: 2,
      status: 'failed',
      dataSnapshotID: null,
      keySnapshotID: null,
      failure: 'restic backup of keys.db in the key repo exited 1: Fatal: the stub fails backup',
    }),
  ]);

  expect(keys).toStrictEqual([expect.objectContaining({ publish: 1 })]);
  expect(afterwards.data).toHaveLength(1);
  expect(hasNote).toBeTrue();
});

test('it fails the receipt and writes no snapshot when the data repo cannot be listed and the key repo holds no number', async () => {
  const ctx = await setupTest();

  await ctx.stageSet(1);

  const failing = ctx.buildClients('', 'snapshots');

  const receipts = await ctx.runPass({ data: failing.data, keys: ctx.repos.keys });
  const afterwards = await ctx.readBothRepos();

  expect(receipts).toStrictEqual([
    expect.objectContaining({ status: 'failed', keySnapshotID: null }),
  ]);

  expect(afterwards).toStrictEqual({ keys: [], data: [] });
});

test('it writes no snapshot and removes no key snapshot when the data repo cannot be listed', async () => {
  const ctx = await setupTest();

  await ctx.writeTaggedSnapshot(ctx.repos.keys, ['set-1', 'kind-scheduled', 'publish-2']);
  await ctx.stageSet(2);

  const failing = ctx.buildClients('', 'snapshots');

  const receipts = await ctx.runPass({ data: failing.data, keys: ctx.repos.keys });
  const keys = await ctx.repos.keys.readSnapshots();
  const afterwards = await ctx.readBothRepos();

  expect(receipts).toStrictEqual([
    expect.objectContaining({
      status: 'failed',
      keySnapshotID: null,
      failure: 'restic snapshots in the data repo exited 1: Fatal: the stub fails snapshots',
    }),
  ]);

  expect(keys).toStrictEqual([expect.objectContaining({ set: 1, publish: 2 })]);
  expect(afterwards.data).toStrictEqual([]);
});

test('it fails the receipt and writes no snapshot when the key repo cannot be listed', async () => {
  const ctx = await setupTest();

  await ctx.stageSet(1);
  await ctx.writeNote(null);

  const failing = ctx.buildClients('snapshots', '');

  const receipts = await ctx.runPass({ data: ctx.repos.data, keys: failing.keys });
  const afterwards = await ctx.readBothRepos();
  const hasNote = await ctx.probeNote();

  expect(receipts).toStrictEqual([expect.objectContaining({ status: 'failed' })]);
  expect(afterwards).toStrictEqual({ keys: [], data: [] });
  expect(hasNote).toBeTrue();
});

test('it raises proven-from, with no legacy-set, for a note that names no key snapshot, and removes the note', async () => {
  const ctx = await setupTest();

  await ctx.writeTaggedSnapshot(ctx.repos.keys, [
    'set-4',
    'kind-scheduled',
    'publish-3',
    'legacy-set-2',
  ]);

  await ctx.stageSet(5);
  await ctx.writeNote(null);
  await ctx.runPass(ctx.repos);

  const keys = await ctx.repos.keys.readSnapshots();
  const hasNote = await ctx.probeNote();

  expect(keys).toStrictEqual([
    expect.objectContaining({ publish: 4, legacySet: null, provenFrom: 4 }),
  ]);

  expect(hasNote).toBeFalse();
});

test('it raises proven-from for a note that names an older key snapshot than the newest', async () => {
  const ctx = await setupTest();

  await ctx.writeTaggedSnapshot(ctx.repos.keys, [
    'set-4',
    'kind-scheduled',
    'publish-3',
    'legacy-set-2',
  ]);

  await ctx.stageSet(5);
  await ctx.writeNote('f'.repeat(64));
  await ctx.runPass(ctx.repos);

  const keys = await ctx.repos.keys.readSnapshots();
  const hasNote = await ctx.probeNote();

  expect(keys).toStrictEqual([
    expect.objectContaining({ publish: 4, legacySet: null, provenFrom: 4 }),
  ]);

  expect(hasNote).toBeFalse();
});

test('it raises proven-from for a note that does not parse', async () => {
  const ctx = await setupTest();

  await ctx.writeTaggedSnapshot(ctx.repos.keys, [
    'set-4',
    'kind-scheduled',
    'publish-3',
    'legacy-set-2',
  ]);

  await ctx.stageSet(5);

  await writeFile(ctx.notePath, 'not json');

  await ctx.runPass(ctx.repos);

  const keys = await ctx.repos.keys.readSnapshots();
  const hasNote = await ctx.probeNote();

  expect(keys).toStrictEqual([
    expect.objectContaining({ publish: 4, legacySet: null, provenFrom: 4 }),
  ]);

  expect(hasNote).toBeFalse();
});

test('it copies the tags for a note that names the newest key snapshot, and removes the note', async () => {
  const ctx = await setupTest();

  await ctx.writeTaggedSnapshot(ctx.repos.keys, [
    'set-4',
    'kind-scheduled',
    'publish-3',
    'legacy-set-2',
    'proven-from-3',
  ]);

  const [newest] = await ctx.repos.keys.readSnapshots();

  invariant(newest, 'the seed wrote one key snapshot');

  await ctx.stageSet(5);
  await ctx.writeNote(newest.snapshotID);
  await ctx.runPass(ctx.repos);

  const keys = await ctx.repos.keys.readSnapshots();
  const hasNote = await ctx.probeNote();

  expect(keys).toStrictEqual([
    expect.objectContaining({ publish: 4, legacySet: 2, provenFrom: 3 }),
  ]);

  expect(hasNote).toBeFalse();
});

test('it leaves a key snapshot with no data snapshot, and publishes the set again as the next number, when it stops between the 2', async () => {
  const ctx = await setupTest();

  await ctx.stageSet(1);

  const stopping = {
    keys: ctx.repos.keys,
    data: {
      ...ctx.repos.data,
      writeSnapshot: () => Promise.reject(new Error('EIO: the data write stopped')),
    },
  };

  const stopped = await ctx.runPass(stopping).then(
    () => null,
    (error: unknown) => error,
  );

  const keysAfterStop = await ctx.repos.keys.readSnapshots();
  const dataAfterStop = await ctx.repos.data.readSnapshots();

  expect(stopped).toMatchObject({ message: 'EIO: the data write stopped' });
  expect(keysAfterStop).toStrictEqual([expect.objectContaining({ publish: 1 })]);
  expect(dataAfterStop).toStrictEqual([]);

  const receipts = await ctx.runPass(ctx.repos);
  const keys = await ctx.repos.keys.readSnapshots();
  const data = await ctx.repos.data.readSnapshots();

  expect(receipts).toStrictEqual([expect.objectContaining({ sequence: 1, status: 'published' })]);
  expect(keys.map((snapshot) => snapshot.publish)).toStrictEqual([2]);
  expect(data.map((snapshot) => snapshot.publish)).toStrictEqual([2]);
});

test('it picks the higher publish number when it stops before it removes the replaced key snapshot', async () => {
  const ctx = await setupTest();

  await ctx.stageSet(1);
  await ctx.runPass(ctx.repos);
  await ctx.stageSet(2);

  const stopping = {
    data: ctx.repos.data,
    keys: {
      ...ctx.repos.keys,
      removeSnapshots: () => Promise.reject(new Error('EIO: the removal stopped')),
    },
  };

  await ctx.runPass(stopping).catch(() => null);

  const keys = await ctx.repos.keys.readSnapshots();

  expect(keys.map((snapshot) => snapshot.publish)).toIncludeSameMembers([1, 2]);
  expect(pickNewestKey(keys)).toStrictEqual(expect.objectContaining({ publish: 2 }));
});

test('it drops the replaced key snapshot by legacy-set when the first numbered publish stops before it removes it', async () => {
  const ctx = await setupTest();

  await ctx.writeTaggedSnapshot(ctx.repos.keys, ['set-5', 'kind-scheduled']);
  await ctx.stageSet(6);

  const stopping = {
    data: ctx.repos.data,
    keys: {
      ...ctx.repos.keys,
      removeSnapshots: () => Promise.reject(new Error('EIO: the removal stopped')),
    },
  };

  await ctx.runPass(stopping).catch(() => null);

  const keys = await ctx.repos.keys.readSnapshots();

  expect(keys).toHaveLength(2);

  expect(pickNewestKey(keys)).toStrictEqual(
    expect.objectContaining({ set: 6, publish: 1, legacySet: 5 }),
  );
});

test('it keeps the note and raises proven-from again when it stops before it removes the note', async () => {
  const ctx = await setupTest();

  await ctx.stageSet(1);
  await ctx.writeNote(null);

  const stopping = {
    ...localJobFiles,
    removeFile: (path: string) =>
      path === ctx.notePath
        ? Promise.reject(new Error('EIO: the note removal stopped'))
        : localJobFiles.removeFile(path),
  };

  await ctx.runPass(ctx.repos, stopping).catch(() => null);

  const hasNote = await ctx.probeNote();

  await ctx.runPass(ctx.repos);

  const keys = await ctx.repos.keys.readSnapshots();

  expect(hasNote).toBeTrue();
  expect(keys).toStrictEqual([expect.objectContaining({ publish: 2, provenFrom: 2 })]);
});
