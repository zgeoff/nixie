import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleShellRequest } from './handle-shell-request';

async function setupTest() {
  const made = await mkdtemp(join(tmpdir(), 'shell-files-'));
  const base = await realpath(made);

  onTestFinished(() => rm(base, { recursive: true, force: true }));

  const root = join(base, 'files');

  await mkdir(root);

  const wrapped: string[][] = [];

  const context = {
    root,
    env: { PATH: process.env['PATH'] ?? '' },
    account: {
      wrap: (argv: readonly string[]) => {
        wrapped.push([...argv]);

        return [...argv];
      },
    },
    takeIsDiskNew: () => Promise.resolve(false),
  };

  return { base, root, wrapped, context };
}

test('it writes a file through the terminal account, so the file belongs to the terminal user', async () => {
  const ctx = await setupTest();

  const reply = await handleShellRequest(ctx.context, {
    op: 'writeFile',
    path: 'downloads/report.txt',
    base64: Buffer.from('report body').toString('base64'),
  });

  const text = await readFile(join(ctx.root, 'downloads/report.txt'), 'utf8');

  expect(reply).toMatchObject({ kind: 'written', bytes: 11 });
  expect(text).toBe('report body');
  expect(ctx.wrapped).toHaveLength(1);
});

test('it reads a file through the terminal account', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'notes.md'), 'high at six');

  const reply = await handleShellRequest(ctx.context, { op: 'readFile', path: 'notes.md' });

  expect(reply).toMatchObject({
    kind: 'file',
    name: 'notes.md',
    base64: Buffer.from('high at six').toString('base64'),
  });

  expect(ctx.wrapped).toHaveLength(1);
});

test('it refuses a link that leaves the files folder', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.base, 'outside.txt'), 'secret');
  await symlink(join(ctx.base, 'outside.txt'), join(ctx.root, 'link.txt'));

  const reply = await handleShellRequest(ctx.context, { op: 'readFile', path: 'link.txt' });

  expect(reply).toStrictEqual({ kind: 'failed', ok: false, reason: 'bad_path' });
  expect(ctx.wrapped).toStrictEqual([]);
});
