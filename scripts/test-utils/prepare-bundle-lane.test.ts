import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubProgram } from './create-stub-program';
import prepareBundleLane from './prepare-bundle-lane';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-bundle-lane-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const binDir = join(directory, 'bin');

  return {
    bunPath: join(binDir, 'bun'),
    callsPath: join(directory, 'calls'),
    env: { PATH: `${binDir}:/usr/bin:/bin` },
  };
}

test('it builds the web app and the backup job before the bundle lane runs', async () => {
  const ctx = await setupTest();

  createStubProgram(ctx.bunPath, { callsPath: ctx.callsPath });

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

  const calls = await readFile(ctx.callsPath, 'utf8');

  expect(calls).toBe('bun run test:web-build\nbun run test:backup-job-build\n');
});
