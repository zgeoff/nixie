import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';
import { buildStubSandboxAdapter } from '../test-utils/build-stub-sandbox-adapter';
import { makeFolderExec, readDiskFiles } from '../test-utils/make-folder-exec';
import type { DesktopDiskSeed } from '../test-utils/seed-desktop-disk';
import { seedDesktopDisk } from '../test-utils/seed-desktop-disk';
import { computerOwner } from './computer-owner';
import { startComputer } from './start-computer';
import { writeCopyState } from './write-copy-state';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'ready-sandbox-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  const lost: { path: string | null } = { path: null };

  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0), {
    exec: makeFolderExec(root, { loseWrite: (path) => path === lost.path }),
  });

  const startImage = (image: string) => {
    const computer = startComputer({
      adapter,
      image,
      argv: ['guest'],
      scans: {
        scan: () => Promise.resolve({ kind: 'pass' as const }),
        scanText: () => Promise.resolve({ kind: 'pass' as const }),
      },
      deniedRanges: [],
      timeZone: 'UTC',
      logger: () => {},
      clock: createFakeClock({ startMs: 1_000_000 }),
    });

    onTestFinished(() => computer.stop());

    return computer;
  };

  return {
    root,
    adapter,
    computer: startImage('computer-new'),
    startImage,
    lost,
    seed: { desktopDisk: (input: DesktopDiskSeed) => seedDesktopDisk({ adapter, root }, input) },
  };
}

test('it answers ready once the old desktop disk is copied into the new sandbox', async () => {
  const ctx = await setupTest();

  await ctx.seed.desktopDisk({
    image: 'computer-old',
    files: { '/home/stub/files/note.txt': 'x' },
  });

  const gate = await ctx.computer.settleMove();

  expect(gate).toBe('ready');
});

test('it destroys the old desktop once its disk is copied', async () => {
  const ctx = await setupTest();

  const old = await ctx.seed.desktopDisk({
    image: 'computer-old',
    files: { '/home/stub/files/note.txt': 'x' },
  });

  await ctx.computer.settleMove();

  expect(ctx.adapter.destroyed).toStrictEqual([old.id]);
});

test('it copies the files and the profile of the old desktop into the new sandbox', async () => {
  const ctx = await setupTest();

  await ctx.seed.desktopDisk({
    image: 'computer-old',
    files: {
      '/home/stub/files/note.txt': 'tide times',
      '/home/stub/profile/Default/Cookies': 'cookie-bytes',
    },
  });

  await ctx.computer.settleMove();

  const created = ctx.adapter.created.at(-1);

  invariant(created);

  const disk = await readDiskFiles(ctx.root, created.id);

  expect(disk).toIncludeSameMembers([
    ['/home/stub/files/note.txt', 'tide times'],
    ['/home/stub/profile/Default/Cookies', 'cookie-bytes'],
  ]);
});

test('it marks the new disk as used so the guest reports no new disk', async () => {
  const ctx = await setupTest();

  await ctx.seed.desktopDisk({
    image: 'computer-old',
    files: { '/home/stub/files/note.txt': 'tide times' },
  });

  await ctx.computer.settleMove();

  const created = ctx.adapter.created.at(-1);

  invariant(created);

  expect(ctx.adapter.files.get(created.id)?.has('/home/stub/.nixie-disk-used')).toBe(true);
});

test('it answers moving when a copy fails its check', async () => {
  const ctx = await setupTest();

  await ctx.seed.desktopDisk({
    image: 'computer-old',
    files: { '/home/stub/files/note.txt': 'tide times' },
  });

  ctx.lost.path = 'home/stub/files/note.txt';

  const gate = await ctx.computer.settleMove();

  expect(gate).toBe('moving');
});

test('it keeps only the old desktop when a copy fails its check', async () => {
  const ctx = await setupTest();

  const old = await ctx.seed.desktopDisk({
    image: 'computer-old',
    files: { '/home/stub/files/note.txt': 'tide times' },
  });

  ctx.lost.path = 'home/stub/files/note.txt';

  await ctx.computer.settleMove();

  const survivors = await ctx.adapter.list(computerOwner);

  expect(survivors.map((sandbox) => sandbox.id)).toStrictEqual([old.id]);
});

test('it answers ready on the next call after a failed copy', async () => {
  const ctx = await setupTest();

  await ctx.seed.desktopDisk({
    image: 'computer-old',
    files: { '/home/stub/files/note.txt': 'tide times' },
  });

  ctx.lost.path = 'home/stub/files/note.txt';

  await ctx.computer.settleMove();

  ctx.lost.path = null;

  const gate = await ctx.computer.settleMove();

  expect(gate).toBe('ready');
});

test('it copies the files into the new sandbox on the next call after a failed copy', async () => {
  const ctx = await setupTest();

  await ctx.seed.desktopDisk({
    image: 'computer-old',
    files: { '/home/stub/files/note.txt': 'tide times' },
  });

  ctx.lost.path = 'home/stub/files/note.txt';

  await ctx.computer.settleMove();

  ctx.lost.path = null;

  await ctx.computer.settleMove();

  const created = ctx.adapter.created.at(-1);

  invariant(created);

  const disk = await readDiskFiles(ctx.root, created.id);

  expect(disk).toStrictEqual([['/home/stub/files/note.txt', 'tide times']]);
});

test('it keeps the good disk when a newer release follows a failed copy that left a half copy', async () => {
  const ctx = await setupTest();

  await ctx.seed.desktopDisk({
    image: 'computer-old',
    files: { '/home/stub/files/note.txt': 'tide times' },
  });

  ctx.lost.path = 'home/stub/files/note.txt';

  ctx.adapter.failNextDestroy('impd is down');

  await ctx.computer.settleMove();

  ctx.lost.path = null;

  await ctx.startImage('computer-newer').settleMove();

  const survivors = await ctx.adapter.list(computerOwner);

  const [survivor] = survivors;

  invariant(survivor);

  const disk = await readDiskFiles(ctx.root, survivor.id);

  expect(disk).toStrictEqual([['/home/stub/files/note.txt', 'tide times']]);
});

test('it copies again over a new sandbox that a failed copy left behind', async () => {
  const ctx = await setupTest();

  const old = await ctx.seed.desktopDisk({
    image: 'computer-old',
    files: { '/home/stub/files/note.txt': 'tide times' },
  });

  ctx.lost.path = 'home/stub/files/note.txt';

  ctx.adapter.failNextDestroy('impd is down');

  await ctx.computer.settleMove();

  ctx.lost.path = null;

  await ctx.computer.settleMove();

  const created = ctx.adapter.created.at(-1);

  invariant(created);

  const disk = await readDiskFiles(ctx.root, created.id);

  expect(disk).toStrictEqual([['/home/stub/files/note.txt', 'tide times']]);
  expect(ctx.adapter.destroyed).toStrictEqual([old.id]);
});

test('it moves the good disk to a newer release after a failed copy over a replacement that once passed', async () => {
  const ctx = await setupTest();

  await ctx.seed.desktopDisk({
    image: 'computer-old',
    files: { '/home/stub/files/note.txt': 'tide times' },
  });

  ctx.adapter.failNextDestroy('impd is down');

  await ctx.computer.settleMove();

  ctx.lost.path = 'home/stub/files/note.txt';

  await ctx.computer.settleMove();

  ctx.lost.path = null;

  const gate = await ctx.startImage('computer-newer').settleMove();
  const survivors = await ctx.adapter.list(computerOwner);

  const disks = await Promise.all(
    survivors.map(async (sandbox) => ({
      image: sandbox.spec.image,
      files: await readDiskFiles(ctx.root, sandbox.id),
    })),
  );

  expect(gate).toBe('ready');

  expect(disks).toStrictEqual([
    { image: 'computer-newer', files: [['/home/stub/files/note.txt', 'tide times']] },
  ]);
});

test('it moves the good disk to a newer release after a failed read left an empty replacement', async () => {
  const ctx = await setupTest();

  await ctx.seed.desktopDisk({
    image: 'computer-old',
    files: { '/home/stub/files/note.txt': 'tide times' },
  });

  ctx.adapter.failNextFileList('impd is down');
  ctx.adapter.failNextDestroy('impd is down');

  await ctx.computer.settleMove();

  const gate = await ctx.startImage('computer-newer').settleMove();
  const survivors = await ctx.adapter.list(computerOwner);

  const disks = await Promise.all(
    survivors.map(async (sandbox) => ({
      image: sandbox.spec.image,
      files: await readDiskFiles(ctx.root, sandbox.id),
    })),
  );

  expect(gate).toBe('ready');

  expect(disks).toStrictEqual([
    { image: 'computer-newer', files: [['/home/stub/files/note.txt', 'tide times']] },
  ]);
});

test('it replaces a lone desktop of the current image whose copy never finished', async () => {
  const ctx = await setupTest();

  const unfinished = await ctx.seed.desktopDisk({
    image: 'computer-new',
    files: { '/home/stub/files/note.txt': 'tide ti' },
  });

  await writeCopyState(unfinished, {}, 'started');

  await ctx.computer.settleMove();

  const survivors = await ctx.adapter.list(computerOwner);

  const created = ctx.adapter.created.at(-1);

  invariant(created);

  expect(survivors.map((sandbox) => sandbox.id)).toStrictEqual([created.id]);
  expect(created.id).not.toBe(unfinished.id);
});
