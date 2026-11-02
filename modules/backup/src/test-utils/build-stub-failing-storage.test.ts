import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localDataStorage } from '@heynixie/log';
import { buildStubFailingStorage } from './build-stub-failing-storage';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-failing-storage-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it fails the fsync of a file with the given name', async () => {
  const ctx = await setupTest();

  const storage = buildStubFailingStorage(localDataStorage, 'complete', 'fsync');

  await writeFile(join(ctx.directory, 'complete'), '');

  expect(storage.files.writeFileToDisk(join(ctx.directory, 'complete'))).rejects.toThrow(
    'the stub fails the fsync of complete',
  );
});

test('it passes the fsync of any other file on to the storage it wraps', async () => {
  const ctx = await setupTest();

  const storage = buildStubFailingStorage(localDataStorage, 'complete', 'fsync');

  await writeFile(join(ctx.directory, 'manifest.json'), '{}');

  await expect(storage.files.writeFileToDisk(join(ctx.directory, 'manifest.json'))).toResolve();
});

test('it fails the write of a file with the given name and leaves no file', async () => {
  const ctx = await setupTest();

  const storage = buildStubFailingStorage(localDataStorage, 'complete', 'write');

  const failure = await storage.files.writeFile(join(ctx.directory, 'complete'), '').then(
    () => null,
    (error: unknown) => error,
  );

  const names = await readdir(ctx.directory);

  expect(failure).toMatchObject({ message: 'the stub fails the write of complete' });
  expect(names).toStrictEqual([]);
});

test('it passes the write of any other file on to the storage it wraps', async () => {
  const ctx = await setupTest();

  const storage = buildStubFailingStorage(localDataStorage, 'complete', 'write');

  await storage.files.writeFile(join(ctx.directory, 'manifest.json'), '{}');

  const names = await readdir(ctx.directory);

  expect(names).toStrictEqual(['manifest.json']);
});
