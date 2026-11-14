import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSpoolBytes } from './read-spool-bytes';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-spool-read-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it reads a regular file within the limit', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'a.cap');

  await writeFile(path, new Uint8Array([1, 2, 3]));

  const received = await readSpoolBytes(path, 8);

  expect(received).toStrictEqual(new Uint8Array([1, 2, 3]));
});

test('it refuses a file over the limit', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'a.cap');

  await writeFile(path, new Uint8Array(9));

  const received = await readSpoolBytes(path, 8);

  expect(received).toBeNull();
});

test('it refuses a symlink without following it', async () => {
  const ctx = await setupTest();

  const target = join(ctx.directory, 'target');
  const path = join(ctx.directory, 'a.cap');

  await writeFile(target, new Uint8Array([1]));
  await symlink(target, path);

  const received = await readSpoolBytes(path, 8);

  expect(received).toBeNull();
});

test('it refuses a FIFO with no writer at once', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'a.cap');

  Bun.spawnSync(['mkfifo', path]);

  const received = await readSpoolBytes(path, 8);

  expect(received).toBeNull();
});
