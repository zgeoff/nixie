import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import prepareResticLane from './prepare-restic-lane';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-restic-lane-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const binDir = join(directory, 'bin');

  return {
    binDir,
    env: { PATH: `${binDir}:/usr/bin:/bin` },
  };
}

test('it builds the backup job before the restic lane runs, and names its build for the suites', async () => {
  const ctx = await setupTest();

  createStubBin(ctx.binDir, 'bun');

  const start = prepareResticLane({
    repoRoot: '/srv/orchard',
    runID: 'run-7',
    environment: ctx.env,
    lane: {
      name: 'restic',
      suffix: '.restic',
      limitMs: 40_000,
      parallel: 'workers',
      memory: null,
      start: 'scripts/test-utils/prepare-restic-lane.ts',
      stop: null,
    },
  });

  const calls = readStubCalls(ctx.binDir).map((call) => call.argv);

  expect(calls).toStrictEqual([['run', 'test:backup-job-program']]);

  expect(start).toStrictEqual({
    environment: { RIG_PROGRAM_BACKUP_JOB: '/srv/orchard/apps/backup-job/dist/main.js' },
  });
});
