import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LogFields, LogLevel } from '@heynixie/logger';
import { buildResticClient } from '../restic/build-restic-client';
import { createStubRestic } from '../test-utils/create-stub-restic';
import { localFetchFiles } from './local-fetch-files';
import { runLoggedFetch, runLoggedFetchOf } from './run-logged-fetch';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-logged-fetch-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const restic = await createStubRestic(directory);

  const repos = {
    data: buildResticClient(
      { restic, backendEnv: {} },
      { repository: join(directory, 'data'), password: 'data-pass' },
      'data',
    ),
    keys: buildResticClient(
      { restic, backendEnv: {} },
      { repository: join(directory, 'keys'), password: 'key-pass' },
      'key',
    ),
  };

  await repos.data.createRepository();
  await repos.keys.createRepository();

  await writeFile(join(directory, 'copy.bin'), 'copy');

  const keyID = await repos.keys.writeSnapshot(join(directory, 'copy.bin'), 'keys.db', [
    'set-4',
    'publish-7',
  ]);

  const dataID = await repos.data.writeSnapshot(join(directory, 'copy.bin'), 'nixie.db', [
    'set-4',
    'publish-7',
  ]);

  const request = {
    repos,
    files: localFetchFiles,
    directory: join(directory, 'fetched'),
    dataSnapshotID: null,
    now: () => 1_798_761_660_000,
  };

  return { request, keyID, dataID };
}

test('it exits 0 after one backup.fetched line', async () => {
  const ctx = await setupTest();

  const lines: [string, LogFields | undefined, LogLevel | undefined][] = [];

  const exitCode = await runLoggedFetch(ctx.request, (event, fields, level) => {
    lines.push([event, fields, level]);
  });

  expect(exitCode).toBe(0);

  expect(lines).toStrictEqual([
    [
      'backup.fetched',
      {
        dataSnapshotID: ctx.dataID,
        keySnapshotID: ctx.keyID,
        dataSet: 4,
        keySet: 4,
        dataPublish: 7,
        keyPublish: 7,
        relation: 'same-publish',
      },
      undefined,
    ],
  ]);
});

test('it exits 1 after one backup.fetch_failed line with the refusal of a refused pick', async () => {
  const ctx = await setupTest();

  const lines: [string, LogFields | undefined, LogLevel | undefined][] = [];

  const exitCode = await runLoggedFetch(
    { ...ctx.request, dataSnapshotID: 'f'.repeat(64) },
    (event, fields, level) => {
      lines.push([event, fields, level]);
    },
  );

  expect(exitCode).toBe(1);

  expect(lines).toStrictEqual([
    ['backup.fetch_failed', { step: 'pick', refusal: 'no-such-data-snapshot' }, 'error'],
  ]);
});

test('it exits 1 after one backup.fetch_failed line with a step only for a path that is not a directory', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.request.directory, '..', 'fetched'), 'a file, not a directory');

  const lines: [string, LogFields | undefined, LogLevel | undefined][] = [];

  const exitCode = await runLoggedFetch(ctx.request, (event, fields, level) => {
    lines.push([event, fields, level]);
  });

  expect(exitCode).toBe(1);
  expect(lines).toStrictEqual([['backup.fetch_failed', { step: 'directory' }, 'error']]);
});

test('it exits 1 after one backup.fetch_failed line at the config step for a request that cannot be built', async () => {
  const lines: [string, LogFields | undefined, LogLevel | undefined][] = [];

  const exitCode = await runLoggedFetchOf(
    () => {
      throw new Error('NIXIE_BACKUP_DATA_REPOSITORY is not set');
    },
    (event, fields, level) => {
      lines.push([event, fields, level]);
    },
  );

  expect(exitCode).toBe(1);
  expect(lines).toStrictEqual([['backup.fetch_failed', { step: 'config' }, 'error']]);
});
