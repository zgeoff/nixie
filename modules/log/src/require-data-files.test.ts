import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localDataStorage } from './local-data-storage';
import { requireDataFiles } from './require-data-files';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-data-files-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it accepts a directory that holds nixie.db and keys.db', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'nixie.db'), '');
  await writeFile(join(ctx.directory, 'keys.db'), '');

  await expect(requireDataFiles(localDataStorage.files, ctx.directory, 'the backup')).toResolve();
});

test('it names the first data file the directory lacks', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'keys.db'), '');

  expect(
    requireDataFiles(localDataStorage.files, ctx.directory, 'the backup'),
  ).rejects.toThrowWithMessage(Error, 'the backup holds no nixie.db');
});
