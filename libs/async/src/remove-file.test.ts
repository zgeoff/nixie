import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeFile } from './remove-file';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-remove-file-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it removes the file at the path', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'set.lock'), '4242\n');
  await removeFile(join(ctx.directory, 'set.lock'));

  const names = await readdir(ctx.directory);

  expect(names).toStrictEqual([]);
});

test('it resolves when no file is at the path', async () => {
  const ctx = await setupTest();

  expect(removeFile(join(ctx.directory, 'set.lock'))).resolves.toBeUndefined();
});

test('it refuses to remove a folder', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'keep.txt'), 'kept\n');

  expect(removeFile(ctx.directory)).rejects.toMatchObject({ code: 'ERR_FS_EISDIR' });
});
