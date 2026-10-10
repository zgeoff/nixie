import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimWriterLock } from './claim-writer-lock';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-lock-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  return { dataDir };
}

test('it refuses a second claim while the first holds the lock', async () => {
  const ctx = await setupTest();

  const first = claimWriterLock(ctx.dataDir);

  onTestFinished(() => {
    first.release();
  });

  expect(() => claimWriterLock(ctx.dataDir)).toThrowWithMessage(
    Error,
    'writer lock held by another process',
  );
});

test('it grants the lock again once the holder releases it', async () => {
  const ctx = await setupTest();

  claimWriterLock(ctx.dataDir).release();

  const second = claimWriterLock(ctx.dataDir);

  onTestFinished(() => {
    second.release();
  });

  expect(second.release).toBeFunction();
});

test('it locks only its own data directory', async () => {
  const ctx = await setupTest();

  const other = await mkdtemp(join(tmpdir(), 'nixie-lock-other-'));

  onTestFinished(() => rm(other, { recursive: true, force: true }));

  const first = claimWriterLock(ctx.dataDir);

  onTestFinished(() => {
    first.release();
  });

  const second = claimWriterLock(other);

  onTestFinished(() => {
    second.release();
  });

  expect(second.release).toBeFunction();
});
