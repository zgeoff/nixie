import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localDataStorage } from '@heynixie/log';
import { buildStubFailingStorage } from './build-stub-failing-storage';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-failing-storage-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, storage: buildStubFailingStorage(localDataStorage, 'complete') };
}

test('it fails the fsync of a file with the given name', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'complete'), '');

  expect(ctx.storage.files.writeFileToDisk(join(ctx.directory, 'complete'))).rejects.toThrow(
    'the stub fails the fsync of complete',
  );
});

test('it passes the fsync of any other file on to the storage it wraps', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'manifest.json'), '{}');

  await expect(ctx.storage.files.writeFileToDisk(join(ctx.directory, 'manifest.json'))).toResolve();
});
