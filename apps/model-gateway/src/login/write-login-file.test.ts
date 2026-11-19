import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLoginFile } from '../test-utils/build-login-file';
import { readLoginFile } from './read-login-file';
import { writeLoginFile } from './write-login-file';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'model-gateway-write-login-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const folder = join(directory, 'logins');

  return { folder, path: join(folder, 'plan.json') };
}

test('it writes a login file that only its owner reads, and reads it back', async () => {
  const ctx = await setupTest();

  const login = buildLoginFile();

  await writeLoginFile(ctx.path, login);

  const info = await stat(ctx.path);

  expect(info.mode & 0o777).toBe(0o600);

  const result = await readLoginFile(ctx.path);

  expect(result).toStrictEqual(login);
});

test('it replaces the login file with a new file and leaves no second file behind', async () => {
  const ctx = await setupTest();

  await writeLoginFile(ctx.path, buildLoginFile());

  const before = await stat(ctx.path);

  await writeLoginFile(ctx.path, buildLoginFile({ refreshToken: 'refresh-token-2' }));

  const after = await stat(ctx.path);

  expect(after.ino).not.toBe(before.ino);

  const names = await readdir(ctx.folder);

  expect(names).toStrictEqual(['plan.json']);
});

test('it leaves the earlier login file whole when the write fails before its rename', async () => {
  const ctx = await setupTest();

  await writeLoginFile(ctx.path, buildLoginFile());

  // a folder in the second file's place makes the write fail before the rename
  await mkdir(`${ctx.path}.next`);

  await expect(
    writeLoginFile(ctx.path, buildLoginFile({ refreshToken: 'refresh-token-2' })),
  ).rejects.toThrow();

  const result = await readLoginFile(ctx.path);

  expect(result?.refreshToken).toBe('refresh-token-1');
});
