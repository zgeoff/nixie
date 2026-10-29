import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localJobFiles } from '../local-job-files';
import { buildStubNixieCleanup } from './build-stub-nixie-cleanup';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-stub-cleanup-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, files: buildStubNixieCleanup(localJobFiles) };
}

test('it removes the set directory once a receipt is renamed into place', async () => {
  const ctx = await setupTest();

  const set = join(ctx.directory, '000000000001');

  await mkdir(set);
  await writeFile(join(set, 'receipt.json.partial'), '{}');

  await ctx.files.renameFile(join(set, 'receipt.json.partial'), join(set, 'receipt.json'));

  const names = await readdir(ctx.directory);

  expect(names).toStrictEqual([]);
});

test('it leaves the directory of any other rename alone', async () => {
  const ctx = await setupTest();

  const set = join(ctx.directory, '000000000001');

  await mkdir(set);
  await writeFile(join(set, 'manifest.json.partial'), '{}');

  await ctx.files.renameFile(join(set, 'manifest.json.partial'), join(set, 'manifest.json'));

  const names = await readdir(set);

  expect(names).toStrictEqual(['manifest.json']);
});
