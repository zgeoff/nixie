import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import prepareBundleLane from './prepare-bundle-lane';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-bundle-lane-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const binDir = join(directory, 'bin');

  return {
    binDir,
    env: { PATH: `${binDir}:/usr/bin:/bin` },
  };
}

test('it builds the web app, the backup job and the gateway binary before the bundle lane runs', async () => {
  const ctx = await setupTest();

  createStubBin(ctx.binDir, 'bun');

  prepareBundleLane({
    repoRoot: '/srv/orchard',
    runID: 'run-7',
    environment: ctx.env,
    lane: {
      name: 'bundle',
      suffix: '.bundle',
      limitMs: 15_000,
      parallel: 'workers',
      memory: null,
      start: 'scripts/test-utils/prepare-bundle-lane.ts',
      stop: null,
    },
  });

  const calls = readStubCalls(ctx.binDir).map((call) => call.argv);

  expect(calls).toStrictEqual([
    ['run', 'test:web-build'],
    ['run', 'test:backup-job-build'],
    ['run', 'test:model-gateway-build'],
  ]);
});
