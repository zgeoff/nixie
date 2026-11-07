import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubProgram } from './create-stub-program';
import prepareResticLane from './prepare-restic-lane';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-restic-lane-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const binDir = join(directory, 'bin');

  return {
    bunPath: join(binDir, 'bun'),
    callsPath: join(directory, 'calls'),
    env: { PATH: `${binDir}:/usr/bin:/bin` },
  };
}

test('it builds the backup job before the restic lane runs', async () => {
  const ctx = await setupTest();

  createStubProgram(ctx.bunPath, { callsPath: ctx.callsPath });

  prepareResticLane({
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

  const calls = await readFile(ctx.callsPath, 'utf8');

  expect(calls).toBe('bun run test:backup-job-build\n');
});
