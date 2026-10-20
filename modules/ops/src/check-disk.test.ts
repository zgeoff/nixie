import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDisk } from './check-disk';
import { makeStubDiskStats } from './test-utils/make-stub-disk-stats';

test('it reads the data volume through statfs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-ops-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const report = await checkDisk(directory);

  expect(report).toStrictEqual({
    isReady: expect.toBeBoolean(),
    reason: expect.toBeOneOf([null, expect.toStartWith('the data volume is ')]),
  });
});

test('it reports ready under 90% full', async () => {
  const report = await checkDisk('/data', makeStubDiskStats({ blocks: 1000, bavail: 101 }));

  expect(report).toStrictEqual({ isReady: true, reason: null });
});

test('it reports unready at 90% full', async () => {
  const report = await checkDisk('/data', makeStubDiskStats({ blocks: 1000, bavail: 100 }));

  expect(report).toStrictEqual({ isReady: false, reason: 'the data volume is 90% full' });
});
