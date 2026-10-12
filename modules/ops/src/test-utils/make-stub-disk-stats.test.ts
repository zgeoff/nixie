import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeStubDiskStats } from './make-stub-disk-stats';

test('it answers the block counts it is given for any path', async () => {
  const readDiskStats = makeStubDiskStats({ blocks: 1000, bavail: 250 });

  const stats = await readDiskStats('/data');

  expect(stats).toStrictEqual({ blocks: 1000, bavail: 250 });
});

test('it answers in the fields that statfs reports the block counts in', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-ops-'));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const stats = await statfs(dir);

  expect(stats).toMatchObject({ blocks: expect.toBeNumber(), bavail: expect.toBeNumber() });
});
