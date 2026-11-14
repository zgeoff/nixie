import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubProgram } from './create-stub-program';
import prepareAgentSDKLane from './prepare-agent-sdk-lane';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-agent-sdk-lane-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const binDir = join(directory, 'bin');

  return {
    bunPath: join(binDir, 'bun'),
    callsPath: join(directory, 'calls'),
    env: { PATH: `${binDir}:/usr/bin:/bin` },
  };
}

test('it builds the conversation guest bundles before the Agent SDK lane runs', async () => {
  const ctx = await setupTest();

  createStubProgram(ctx.bunPath, { callsPath: ctx.callsPath });

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

  const calls = await readFile(ctx.callsPath, 'utf8');

  expect(calls).toBe('bun run test:guest-bundles\n');
});
