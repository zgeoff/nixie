import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchedPairSchema, parseBackupFile, unfinishedBackupMarker } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { buildResticClient } from '../restic/build-restic-client';
import { createStubRestic } from '../test-utils/create-stub-restic';
import { localFetchFiles } from './local-fetch-files';
import { runBackupFetch } from './run-backup-fetch';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-fetch-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const restic = await createStubRestic(directory);

  const dataRepository = { repository: join(directory, 'repos', 'data'), password: 'data-pass' };
  const keyRepository = { repository: join(directory, 'repos', 'keys'), password: 'key-pass' };

  const repos = {
    data: buildResticClient({ restic, backendEnv: {} }, dataRepository, 'data'),
    keys: buildResticClient({ restic, backendEnv: {} }, keyRepository, 'key'),
  };

  await repos.data.createRepository();
  await repos.keys.createRepository();

  // the key snapshot goes first, as a publish writes it
  const writePublish = async (publish: number) => {
    const keyFile = join(directory, `keys-${String(publish)}.bin`);
    const dataFile = join(directory, `data-${String(publish)}.bin`);

    await writeFile(keyFile, new Uint8Array([0x00, 0xff, publish]));
    await writeFile(dataFile, new Uint8Array([0xfe, 0x01, publish]));

    const tags = [`set-${String(publish)}`, 'kind-scheduled', `publish-${String(publish)}`];

    const keySnapshotID = await repos.keys.writeSnapshot(keyFile, 'keys.db', tags);
    const dataSnapshotID = await repos.data.writeSnapshot(dataFile, 'nixie.db', tags);

    return { keySnapshotID, dataSnapshotID };
  };

  const request = {
    repos,
    files: localFetchFiles,
    directory: join(directory, 'fetched'),
    dataSnapshotID: null,
    now: () => 1_798_761_660_000,
  };

  return { directory, restic, dataRepository, keyRepository, repos, writePublish, request };
}

test('it writes both copies and the pair file, then removes the marker', async () => {
  const ctx = await setupTest();
  const published = await ctx.writePublish(1);
  const fetched = await runBackupFetch(ctx.request);
  const names = await readdir(ctx.request.directory);
  const pairText = await Bun.file(join(ctx.request.directory, 'fetched-pair.json')).text();
  const keys = await Bun.file(join(ctx.request.directory, 'keys.db')).bytes();
  const data = await Bun.file(join(ctx.request.directory, 'nixie.db')).bytes();

  const parsed = parseBackupFile(pairText, fetchedPairSchema);

  invariant('value' in parsed, 'the pair file parses');

  expect(fetched.status).toBe('fetched');
  expect(names.toSorted()).toStrictEqual(['fetched-pair.json', 'keys.db', 'nixie.db']);
  expect(keys).toStrictEqual(new Uint8Array([0x00, 0xff, 1]));
  expect(data).toStrictEqual(new Uint8Array([0xfe, 0x01, 1]));

  expect(parsed.value).toStrictEqual({
    format: 1,
    fetchedAt: 1_798_761_660_000,
    key: {
      snapshotID: published.keySnapshotID,
      publish: 1,
      set: 1,
      writtenAt: expect.any(Number),
    },
    data: {
      snapshotID: published.dataSnapshotID,
      publish: 1,
      set: 1,
      writtenAt: expect.any(Number),
    },
    relation: 'same-publish',
  });
});

test('it refuses a data snapshot ahead of the key copy and leaves the marker', async () => {
  const ctx = await setupTest();

  await ctx.writePublish(1);

  await writeFile(join(ctx.directory, 'ahead.bin'), 'ahead');

  const ahead = await ctx.repos.data.writeSnapshot(join(ctx.directory, 'ahead.bin'), 'nixie.db', [
    'set-2',
    'kind-scheduled',
    'publish-2',
  ]);

  const fetched = await runBackupFetch({ ...ctx.request, dataSnapshotID: ahead });
  const names = await readdir(ctx.request.directory);

  expect(fetched).toStrictEqual({
    status: 'failed',
    step: 'pick',
    refusal: 'data-newer-than-keys',
  });

  expect(names).toStrictEqual([unfinishedBackupMarker]);
});

test('it picks again when a publish lands during the fetch', async () => {
  const ctx = await setupTest();

  await ctx.writePublish(1);

  let isPublished = false;

  const data = {
    ...ctx.repos.data,
    restoreSnapshot: async (snapshotID: string, directory: string) => {
      await ctx.repos.data.restoreSnapshot(snapshotID, directory);

      if (!isPublished) {
        isPublished = true;

        await ctx.writePublish(2);
      }
    },
  };

  const fetched = await runBackupFetch({ ...ctx.request, repos: { ...ctx.repos, data } });
  const names = await readdir(ctx.request.directory);
  const keys = await Bun.file(join(ctx.request.directory, 'keys.db')).bytes();

  invariant(fetched.status === 'fetched', 'the second pick holds');

  expect(fetched.pair.key.publish).toBe(2);
  expect(fetched.pair.data.publish).toBe(2);
  expect(names.toSorted()).toStrictEqual(['fetched-pair.json', 'keys.db', 'nixie.db']);
  expect(keys).toStrictEqual(new Uint8Array([0x00, 0xff, 2]));
});

test('it fails at the fourth change of the newest key snapshot and leaves the marker', async () => {
  const ctx = await setupTest();

  await ctx.writePublish(1);

  let latest = 1;

  const data = {
    ...ctx.repos.data,
    restoreSnapshot: async (snapshotID: string, directory: string) => {
      await ctx.repos.data.restoreSnapshot(snapshotID, directory);

      latest += 1;

      await ctx.writePublish(latest);
    },
  };

  const fetched = await runBackupFetch({ ...ctx.request, repos: { ...ctx.repos, data } });
  const names = await readdir(ctx.request.directory);

  expect(fetched).toStrictEqual({ status: 'failed', step: 'pick' });
  expect(latest).toBe(5);
  expect(names).toContain(unfinishedBackupMarker);
  expect(names).not.toContain('fetched-pair.json');
});

test('it leaves the marker after a restic failure', async () => {
  const ctx = await setupTest();

  await ctx.writePublish(1);

  const keys = buildResticClient(
    { restic: ctx.restic, backendEnv: { STUB_RESTIC_FAIL: 'restore' } },
    ctx.keyRepository,
    'key',
  );

  const fetched = await runBackupFetch({ ...ctx.request, repos: { ...ctx.repos, keys } });
  const names = await readdir(ctx.request.directory);

  expect(fetched).toStrictEqual({ status: 'failed', step: 'copy-key' });
  expect(names).toStrictEqual([unfinishedBackupMarker]);
});

test('it refuses a directory that is not empty and writes nothing into it', async () => {
  const ctx = await setupTest();

  await ctx.writePublish(1);

  await mkdir(ctx.request.directory);
  await writeFile(join(ctx.request.directory, 'keep.txt'), 'mine');

  const fetched = await runBackupFetch(ctx.request);
  const names = await readdir(ctx.request.directory);

  expect(fetched).toStrictEqual({ status: 'failed', step: 'directory' });
  expect(names).toStrictEqual(['keep.txt']);
});

test('it uses an empty directory that exists', async () => {
  const ctx = await setupTest();

  await ctx.writePublish(1);

  await mkdir(ctx.request.directory);

  const fetched = await runBackupFetch(ctx.request);

  expect(fetched.status).toBe('fetched');
});
