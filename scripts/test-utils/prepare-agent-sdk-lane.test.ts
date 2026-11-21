import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import prepareAgentSDKLane from './prepare-agent-sdk-lane';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-agent-sdk-lane-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const binDir = join(directory, 'bin');

  return {
    binDir,
    env: { PATH: `${binDir}:/usr/bin:/bin` },
  };
}

test('it builds the conversation guest bundles before the Agent SDK lane runs', async () => {
  const ctx = await setupTest();

  createStubBin(ctx.binDir, 'bun');

  prepareAgentSDKLane({
    repoRoot: '/srv/orchard',
    runID: 'run-7',
    environment: ctx.env,
    lane: {
      name: 'agent-sdk',
      suffix: '.agent-sdk',
      limitMs: 15_000,
      parallel: 'workers',
      memory: null,
      start: 'scripts/test-utils/prepare-agent-sdk-lane.ts',
      stop: null,
    },
  });

  const calls = readStubCalls(ctx.binDir).map((call) => call.argv);

  expect(calls).toStrictEqual([['run', 'test:guest-bundles']]);
});
