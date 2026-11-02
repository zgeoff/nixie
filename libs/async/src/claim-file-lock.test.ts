import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimFileLock } from './claim-file-lock';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-file-lock-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it grants a second shared claim while the first holds the lock', async () => {
  const ctx = await setupTest();

  const first = claimFileLock(ctx.directory, 'shared');

  onTestFinished(() => first?.release());

  const second = claimFileLock(ctx.directory, 'shared');

  onTestFinished(() => second?.release());

  expect(second).not.toBeNull();
});

test('it answers null to an exclusive claim while a shared claim holds the lock', async () => {
  const ctx = await setupTest();

  const shared = claimFileLock(ctx.directory, 'shared');

  onTestFinished(() => shared?.release());

  expect(claimFileLock(ctx.directory, 'exclusive')).toBeNull();
});

test('it answers null to a shared claim while an exclusive claim holds the lock', async () => {
  const ctx = await setupTest();

  const exclusive = claimFileLock(ctx.directory, 'exclusive');

  onTestFinished(() => exclusive?.release());

  expect(claimFileLock(ctx.directory, 'shared')).toBeNull();
});

test('it grants an exclusive claim once the shared holder releases the lock', async () => {
  const ctx = await setupTest();

  claimFileLock(ctx.directory, 'shared')?.release();
  const exclusive = claimFileLock(ctx.directory, 'exclusive');

  onTestFinished(() => exclusive?.release());

  expect(exclusive).not.toBeNull();
});
