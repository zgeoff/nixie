import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSandboxSpec, sandboxSizes } from '@heynixie/sandbox';
import { createFakeClock } from '@zgeoff/testing/clock';
import { buildStubSandboxAdapter } from '../test-utils/build-stub-sandbox-adapter';
import { makeFolderExec, readDiskFiles, writeDiskFiles } from '../test-utils/make-folder-exec';
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
    adapter,
    computer,
    lost,
    createOldDesktop: async () => {
      const old = await adapter.create(
        buildSandboxSpec({
          kind: 'computer',
          image: 'computer-old',
          owner: computerOwner,
          limits: sandboxSizes.computer,
        }),
      );

      await writeDiskFiles(root, old.id, {
        '/home/stub/files/note.txt': 'tide times',
        '/home/stub/profile/Default/Cookies': 'cookie-bytes',
      });

      return old;
    },
    readDisk: (sandboxID: string) => readDiskFiles(root, sandboxID),
  };
}

test('it copies the old desktop disk into the new sandbox and destroys the old one', async () => {
  const ctx = await setupTest();
  const old = await ctx.createOldDesktop();
  const gate = await ctx.computer.settleMove();

  const created = ctx.adapter.created.at(-1);

  expect([
    gate,
    ctx.adapter.destroyed,
    created === undefined ? [] : await ctx.readDisk(created.id),
  ]).toStrictEqual([
    'ready',
    [old.id],
    expect.arrayContaining([
      ['/home/stub/files/note.txt', 'tide times'],
      ['/home/stub/profile/Default/Cookies', 'cookie-bytes'],
    ]),
  ]);
});

test('it keeps the old desktop and answers moving when a copy fails its check', async () => {
  const ctx = await setupTest();
  const old = await ctx.createOldDesktop();

  ctx.lost.path = 'home/stub/files/note.txt';

  const gate = await ctx.computer.settleMove();
  const survivors = await ctx.adapter.list(computerOwner);

  expect([gate, survivors.map((sandbox) => sandbox.id)]).toStrictEqual(['moving', [old.id]]);
});

test('it copies again on the next call after a failed copy', async () => {
  const ctx = await setupTest();
  const old = await ctx.createOldDesktop();

  ctx.lost.path = 'home/stub/files/note.txt';

  await ctx.computer.settleMove();

  ctx.lost.path = null;

  const gate = await ctx.computer.settleMove();
  const survivors = await ctx.adapter.list(computerOwner);

  expect([gate, ctx.adapter.destroyed.includes(old.id), survivors.length]).toStrictEqual([
    'ready',
    true,
    1,
  ]);
});
