import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readProcessesInDirectory } from './read-processes-in-directory';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-cwd-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it reads a process that runs in a folder under the directory', async () => {
  const ctx = await setupTest();

  const folder = join(ctx.directory, 'harbour');

  await mkdir(folder);

  const child = Bun.spawn(['sleep', '60'], { cwd: folder, stdio: ['ignore', 'ignore', 'ignore'] });

  onTestFinished(() => {
    child.kill('SIGKILL');
  });

  const processIDs = await readProcessesInDirectory(ctx.directory);

  expect(processIDs).toStrictEqual([child.pid]);
});

test('it reads a process whose directory was removed while it ran', async () => {
  const ctx = await setupTest();

  const child = Bun.spawn(['sleep', '60'], {
    cwd: ctx.directory,
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  onTestFinished(() => {
    child.kill('SIGKILL');
  });

  await rm(ctx.directory, { recursive: true, force: true });

  const processIDs = await readProcessesInDirectory(ctx.directory);

  expect(processIDs).toStrictEqual([child.pid]);
});

test.each([
  ['a hyphen', '-sibling'],
  ['a space', ' sibling'],
])('it reads no process for a sibling directory whose name adds %s', async (_label, suffix) => {
  const ctx = await setupTest();

  const sibling = `${ctx.directory}${suffix}`;

  await mkdir(sibling);

  onTestFinished(() => rm(sibling, { recursive: true, force: true }));

  const child = Bun.spawn(['sleep', '60'], { cwd: sibling, stdio: ['ignore', 'ignore', 'ignore'] });

  onTestFinished(() => {
    child.kill('SIGKILL');
  });

  const processIDs = await readProcessesInDirectory(ctx.directory);

  expect(processIDs).toStrictEqual([]);
});
