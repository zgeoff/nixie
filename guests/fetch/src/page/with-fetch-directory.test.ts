import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { withFetchDirectory } from './with-fetch-directory';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'fetch-root-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  return { root };
}

test('it runs each fetch in a new directory of its own and removes it after', async () => {
  const ctx = await setupTest();

  const first = await withFetchDirectory(ctx.root, (directory) =>
    Promise.resolve({ directory, existed: existsSync(directory) }),
  );

  const second = await withFetchDirectory(ctx.root, (directory) =>
    Promise.resolve({ directory, existed: existsSync(directory) }),
  );

  const left = await readdir(ctx.root);

  expect(first.existed).toBeTrue();
  expect(second.existed).toBeTrue();
  expect(dirname(first.directory)).toBe(ctx.root);
  expect(dirname(second.directory)).toBe(ctx.root);
  expect(first.directory).not.toBe(second.directory);
  expect(left).toStrictEqual([]);
});

test('it removes the directory when the fetch throws', async () => {
  const ctx = await setupTest();

  const run = withFetchDirectory(ctx.root, async (directory) => {
    await Bun.write(join(directory, 'left.txt'), 'x');

    throw new Error('the fetch failed');
  });

  expect(run).rejects.toThrowWithMessage(Error, 'the fetch failed');

  const left = await readdir(ctx.root);

  expect(left).toStrictEqual([]);
});
