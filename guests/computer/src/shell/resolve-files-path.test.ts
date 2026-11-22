import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveFilesPath } from './resolve-files-path';

async function setupTest() {
  const made = await mkdtemp(join(tmpdir(), 'files-'));
  const base = await realpath(made);

  onTestFinished(async () => {
    await rm(base, { recursive: true, force: true });
  });

  const root = join(base, 'files');

  await mkdir(root);
  await mkdir(join(base, 'outside'));
  await symlink(join(base, 'outside'), join(root, 'link'));

  return { base, root, resolve: (path: string) => resolveFilesPath(root, path) };
}

test.each([
  ['notes.md', 'notes.md'],
  ['~/files/notes.md', 'notes.md'],
  ['~/files', ''],
  ['a/b/../c.txt', 'a/c.txt'],
])('it resolves %s inside the folder', async (path, expected) => {
  const ctx = await setupTest();
  const resolved = await ctx.resolve(path);

  expect(resolved).toBe(join(ctx.root, expected).replace(/\/$/u, ''));
});

test.each(['../outside/x', '~/files/../x', '/etc/passwd', 'link/x', '', 'a/../../x'])(
  'it refuses %p',
  async (path) => {
    const ctx = await setupTest();
    const resolved = await ctx.resolve(path);

    expect(resolved).toBeNull();
  },
);

test('it resolves an absolute path inside the folder', async () => {
  const ctx = await setupTest();
  const resolved = await ctx.resolve(join(ctx.root, 'x.txt'));

  expect(resolved).toBe(join(ctx.root, 'x.txt'));
});
