import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdtemp, readFile, readlink, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSandboxSpec } from '@heynixie/sandbox';
import { buildStubSandboxAdapter } from '../test-utils/build-stub-sandbox-adapter';
import { getFolderDisk, makeFolderExec, writeDiskFiles } from '../test-utils/make-folder-exec';
import { copyComputerFolder, findMismatch, parseFolderEntries } from './copy-computer-folder';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'copy-folder-'));

  onTestFinished(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const lost: { path: string | null } = { path: null };

  const stub = buildStubSandboxAdapter(() => Promise.resolve(0), {
    exec: makeFolderExec(root, { loseWrite: (path) => path === lost.path }),
  });

  const createSandbox = (owner: string) =>
    stub.create(
      buildSandboxSpec({
        kind: 'computer',
        image: 'computer-image',
        owner,
        limits: { vcpus: 1, memoryMiB: 512, diskMiB: 8192 },
      }),
    );

  return {
    lost,
    root,
    createEnds: async () => {
      const from = await createSandbox('old');
      const to = await createSandbox('new');

      return {
        from,
        fromEnv: { HOME: '/home/old' },
        to,
        toEnv: { HOME: '/home/new' },
        folder: 'profile' as const,
        fromFolder: join(getFolderDisk(root, from.id), 'home/old/profile'),
        toFolder: join(getFolderDisk(root, to.id), 'home/new/profile'),
      };
    },
  };
}

test('it copies the bytes and modes of the files, the modes of the folders and the symlinks', async () => {
  const ctx = await setupTest();
  const ends = await ctx.createEnds();

  await writeDiskFiles(ctx.root, ends.from.id, {
    '/home/old/profile/Default/Cookies': 'cookie-bytes',
    '/home/old/profile/bin/start.sh': '#!/bin/sh\necho hi\n',
    '/home/old/profile/secret': 'token',
    '/home/old/profile/empty': '',
  });

  await chmod(join(ends.fromFolder, 'bin/start.sh'), 0o755);
  await chmod(join(ends.fromFolder, 'secret'), 0o600);
  await symlink('Default/Cookies', join(ends.fromFolder, 'SingletonLock'));
  await chmod(join(ends.fromFolder, 'Default'), 0o700);
  await copyComputerFolder(ends);

  const names = ['Default', 'bin/start.sh', 'secret'];

  const stats = await Promise.all(names.map((name) => stat(join(ends.toFolder, name))));
  const empty = await stat(join(ends.toFolder, 'empty'));
  const cookies = await readFile(join(ends.toFolder, 'Default/Cookies'), 'utf8');
  const script = await readFile(join(ends.toFolder, 'bin/start.sh'), 'utf8');
  const link = await readlink(join(ends.toFolder, 'SingletonLock'));

  expect({
    cookies,
    script,
    emptyBytes: empty.size,
    link,
    modes: stats.map((entry) => (entry.mode & 0o7777).toString(8)),
  }).toStrictEqual({
    cookies: 'cookie-bytes',
    script: '#!/bin/sh\necho hi\n',
    emptyBytes: 0,
    link: 'Default/Cookies',
    modes: ['700', '755', '600'],
  });
});

test('it copies a file larger than the 64 MiB that one read of the old disk allows', async () => {
  const ctx = await setupTest();
  const ends = await ctx.createEnds();

  const big = new Uint8Array(64 * 1024 * 1024 + 4096);

  big.fill(7, big.length - 4096);
  big.fill(9, 1024 * 1024 - 8, 1024 * 1024 + 8);

  await writeDiskFiles(ctx.root, ends.from.id, { '/home/old/profile/History': big });
  await copyComputerFolder(ends);

  const read = await readFile(join(ends.toFolder, 'History'));

  const copied = new Uint8Array(read);

  expect(copied.byteLength).toBe(big.byteLength);
  expect(Buffer.compare(copied, big)).toBe(0);
});

test('it copies a folder of more files than one listing holds', async () => {
  const ctx = await setupTest();
  const ends = await ctx.createEnds();

  await Promise.all(
    Array.from({ length: 250 }, (_, index) =>
      writeDiskFiles(ctx.root, ends.from.id, {
        [`/home/old/profile/cache/f${String(index)}`]: String(index),
      }),
    ),
  );

  await copyComputerFolder(ends);

  const last = await readFile(join(ends.toFolder, 'cache/f249'), 'utf8');

  expect(last).toBe('249');
});

test('it throws and keeps the old disk when a file did not reach the new disk', async () => {
  const ctx = await setupTest();
  const ends = await ctx.createEnds();

  await writeDiskFiles(ctx.root, ends.from.id, {
    '/home/old/profile/Default/Cookies': 'cookie-bytes',
    '/home/old/profile/Local State': '{"sign":"in"}',
  });

  ctx.lost.path = 'home/new/profile/Local State';

  await expect(copyComputerFolder(ends)).rejects.toThrow(/Local State is missing/u);

  const kept = await readFile(join(ends.fromFolder, 'Local State'), 'utf8');

  expect(kept).toBe('{"sign":"in"}');
});

test('it clears what an earlier failed copy left in the new folder', async () => {
  const ctx = await setupTest();
  const ends = await ctx.createEnds();

  await writeDiskFiles(ctx.root, ends.from.id, { '/home/old/profile/Cookies': 'cookie-bytes' });
  await writeDiskFiles(ctx.root, ends.to.id, { '/home/new/profile/Half': 'part' });
  await copyComputerFolder(ends);

  const isLeftover = await Bun.file(join(ends.toFolder, 'Half')).exists();

  expect(isLeftover).toBe(false);
});

test('it copies a folder the old disk does not have as an empty one', async () => {
  const ctx = await setupTest();
  const ends = await ctx.createEnds();

  await copyComputerFolder(ends);

  const folder = await stat(ends.toFolder);

  expect(folder.isDirectory()).toBe(true);
});

test('#findMismatch names an entry that differs in its mode', () => {
  const old = parseFolderEntries('f\u0000644\u00005\u0000\u0000a\u0000');
  const held = parseFolderEntries('f\u0000600\u00005\u0000\u0000a\u0000');

  expect(findMismatch(old, held)).toBe('a has other contents or permissions');
});

test('#findMismatch names an entry the new folder holds and the old one lacks', () => {
  const old = parseFolderEntries('');
  const held = parseFolderEntries('l\u0000777\u00000\u0000x\u0000link\u0000');

  expect(findMismatch(old, held)).toBe('link is extra');
});

test('#parseFolderEntries reads each kind, with bytes only for a file', () => {
  const entries = parseFolderEntries(
    'd\u0000700\u00004096\u0000\u0000dir\u0000l\u0000777\u00003\u0000dir\u0000ln\u0000',
  );

  expect(entries).toStrictEqual([
    { kind: 'dir', mode: '700', bytes: 0, target: '', path: 'dir' },
    { kind: 'link', mode: '777', bytes: 0, target: 'dir', path: 'ln' },
  ]);
});
