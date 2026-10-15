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

  const first = await withFetchDirectory(ctx.root, (dir) =>
    Promise.resolve({ dir, existed: existsSync(dir) }),
  );

  const second = await withFetchDirectory(ctx.root, (dir) =>
    Promise.resolve({ dir, existed: existsSync(dir) }),
  );

  const left = await readdir(ctx.root);

  expect(first.existed).toBeTrue();
  expect(second.existed).toBeTrue();
  expect(dirname(first.dir)).toBe(ctx.root);
  expect(dirname(second.dir)).toBe(ctx.root);
  expect(first.dir).not.toBe(second.dir);
  expect(left).toStrictEqual([]);
});

test('it removes the directory when the fetch throws', async () => {
  const ctx = await setupTest();

  const run = withFetchDirectory(ctx.root, async (dir) => {
    await Bun.write(join(dir, 'left.txt'), 'x');

    throw new Error('the fetch failed');
  });

  expect(run).rejects.toThrowWithMessage(Error, 'the fetch failed');

  const left = await readdir(ctx.root);

  expect(left).toStrictEqual([]);
});
