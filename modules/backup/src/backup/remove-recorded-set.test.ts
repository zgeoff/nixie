import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localDataStorage } from '@heynixie/log';
import { removeRecordedSet } from './remove-recorded-set';

async function setupTest() {
  const stagingDir = await mkdtemp(join(tmpdir(), 'nixie-recorded-set-'));

  onTestFinished(() => rm(stagingDir, { recursive: true, force: true }));

  return { stagingDir };
}

test('it removes the set folder and every file in it', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.stagingDir, '000000000003'));
  await writeFile(join(ctx.stagingDir, '000000000003', 'complete'), '');
  await writeFile(join(ctx.stagingDir, '000000000003', 'receipt.json'), '{}');
  await removeRecordedSet(localDataStorage.files, join(ctx.stagingDir, '000000000003'));

  const names = await readdir(ctx.stagingDir);

  expect(names).toStrictEqual([]);
});

test('it leaves no set name behind when the removal stops part way', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.stagingDir, '000000000003'));
  await writeFile(join(ctx.stagingDir, '000000000003', 'complete'), '');
  await writeFile(join(ctx.stagingDir, '000000000003', 'receipt.json'), '{}');

  const files = {
    ...localDataStorage.files,
    removeFile: () => Promise.reject(new Error('the removal stopped')),
  };

  const refused = await removeRecordedSet(files, join(ctx.stagingDir, '000000000003')).then(
    () => null,
    (error: unknown) => error,
  );

  const names = await readdir(ctx.stagingDir);

  expect(refused).toMatchObject({ message: 'the removal stopped' });
  expect(names).toStrictEqual(['000000000003.removed']);
});
