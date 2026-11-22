import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import prepareE2ELane from './prepare-e2e-lane';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-e2e-lane-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const binDir = join(directory, 'bin');

  return {
    binDir,
    env: { PATH: `${binDir}:/usr/bin:/bin` },
  };
}

test('it builds the model files, both bundles and the previous release before the e2e lane runs', async () => {
  const ctx = await setupTest();

  createStubBin(ctx.binDir, 'bun');

  prepareE2ELane({
    repoRoot: '/srv/orchard',
    runID: 'run-7',
    environment: ctx.env,
    lane: {
      name: 'e2e',
      suffix: null,
      limitMs: 15_000,
      parallel: 1,
      memory: null,
      start: 'scripts/test-utils/prepare-e2e-lane.ts',
      stop: null,
    },
  });

  const calls = readStubCalls(ctx.binDir).map((call) => call.argv);

  expect(calls).toStrictEqual([
    ['run', 'models'],
    ['run', 'test:bundles'],
    ['run', 'test:previous-release-build'],
  ]);
});
