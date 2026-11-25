import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writePackageFiles } from './write-package-files';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'nixie-package-'));

  onTestFinished(() => rm(root, { recursive: true }));

  return { root, directory: join(root, 'chart.js@4.4.6') };
}

test('it writes each file under the package folder', async () => {
  const ctx = await setupTest();

  await writePackageFiles(ctx.directory, [
    { path: 'dist/chart.js', bytes: new TextEncoder().encode('var a = 1;') },
  ]);

  const text = await readFile(join(ctx.directory, 'dist/chart.js'), 'utf8');

  expect(text).toBe('var a = 1;');
});

test('it replaces the files that the folder held', async () => {
  const ctx = await setupTest();

  await writePackageFiles(ctx.directory, [{ path: 'old.js', bytes: new Uint8Array([1]) }]);
  await writePackageFiles(ctx.directory, [{ path: 'new.js', bytes: new Uint8Array([2]) }]);

  const names = await readdir(ctx.directory);

  expect(names).toStrictEqual(['new.js']);
});

test.each([
  '../outside.js',
  '/etc/outside.js',
  'a/../../outside.js',
  String.raw`a\b.js`,
  'a//b.js',
  './a.js',
])('it refuses the path %s and writes nothing', async (path) => {
  const ctx = await setupTest();

  const written = writePackageFiles(ctx.directory, [
    { path: 'ok.js', bytes: new Uint8Array([1]) },
    { path, bytes: new Uint8Array([2]) },
  ]);

  await expect(written).rejects.toThrow('unsafe path');

  const names = await readdir(ctx.root);

  expect(names).toStrictEqual([]);
});
