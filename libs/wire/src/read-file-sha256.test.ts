import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSHA256 } from './read-file-sha256';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-digest-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it reads the size and the SHA-256 of a file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'copy.db'), 'abc');

  const digest = await readFileSHA256(join(ctx.directory, 'copy.db'));

  expect(digest).toStrictEqual({
    bytes: 3,
    sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  });
});

test('it reads an empty file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'empty.db'), '');

  const digest = await readFileSHA256(join(ctx.directory, 'empty.db'));

  expect(digest).toStrictEqual({
    bytes: 0,
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  });
});
