import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computerOwner } from '../computer/computer-owner';
import { buildStubSandboxAdapter } from './build-stub-sandbox-adapter';
import { readDiskFiles } from './make-folder-exec';
import { seedDesktopDisk } from './seed-desktop-disk';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'seed-desktop-disk-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0));

  return { root, adapter, deps: { adapter, root } };
}

test('it seeds a desktop sandbox of the computer on the image it is given', async () => {
  const ctx = await setupTest();

  await seedDesktopDisk(ctx.deps, { image: 'computer-old', files: {} });

  const listed = await ctx.adapter.list(computerOwner);

  expect(listed.map((sandbox) => sandbox.spec.image)).toStrictEqual(['computer-old']);
});

test('it puts the files it is given on the disk of the sandbox', async () => {
  const ctx = await setupTest();

  const sandbox = await seedDesktopDisk(ctx.deps, {
    image: 'computer-old',
    files: { '/home/stub/files/note.txt': 'tide times' },
  });

  const disk = await readDiskFiles(ctx.root, sandbox.id);

  expect(disk).toStrictEqual([['/home/stub/files/note.txt', 'tide times']]);
});
