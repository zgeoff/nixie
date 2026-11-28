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

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'ready-sandbox-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  const lost: { path: string | null } = { path: null };

  const adapter = buildStubSandboxAdapter(() => Promise.resolve(0), {
    exec: makeFolderExec(root, { loseWrite: (path) => path === lost.path }),
  });

  const computer = startComputer({
    adapter,
    image: 'computer-new',
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

  return {
    root,
    adapter,
    computer,
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

test('it copies the files again on the next call after a failed copy', async () => {
  const ctx = await setupTest();

  await ctx.seed.desktopDisk({
    image: 'computer-old',
    files: { '/home/stub/files/note.txt': 'tide times' },
  });

  ctx.lost.path = 'home/stub/files/note.txt';

  await ctx.computer.settleMove();

  ctx.lost.path = null;

  await ctx.computer.settleMove();

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
