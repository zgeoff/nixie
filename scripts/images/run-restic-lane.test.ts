import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-restic-lane-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const runnerTemp = join(directory, 'runner-temp');

  mkdirSync(runnerTemp);

  return {
    runnerTemp,
    binPath: join(directory, 'bin'),
    scriptPath: join(import.meta.dir, 'run-restic-lane.ts'),
  };
}

test('it copies the restic out of the backup image and runs the lane on it', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'docker', {
    answers: [{ args: ['create', 'r/nixie-backup@sha256:ab12'], stdout: 'c0ffee\n' }, { args: [] }],
  });

  createStubBin(ctx.binPath, 'bun', { recordEnv: ['NIXIE_RESTIC_BINARY'] });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({ PATH: ctx.binPath, BACKUP: 'r/nixie-backup@sha256:ab12', RUNNER_TEMP: ctx.runnerTemp })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readStubCalls(ctx.binPath)).toMatchObject([
    { name: 'docker', argv: ['create', 'r/nixie-backup@sha256:ab12'] },
    { name: 'docker', argv: ['cp', 'c0ffee:/usr/local/bin/restic', `${ctx.runnerTemp}/restic`] },
    { name: 'docker', argv: ['rm', 'c0ffee'] },
    {
      name: 'bun',
      argv: ['run', 'test:restic'],
      env: { NIXIE_RESTIC_BINARY: `${ctx.runnerTemp}/restic` },
    },
  ]);
});

test('it fails when the lane fails', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'docker', {
    answers: [{ args: ['create', 'r/nixie-backup@sha256:ab12'], stdout: 'c0ffee\n' }, { args: [] }],
  });

  createStubBin(ctx.binPath, 'bun', { answers: [{ args: ['run', 'test:restic'], exitCode: 1 }] });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({ PATH: ctx.binPath, BACKUP: 'r/nixie-backup@sha256:ab12', RUNNER_TEMP: ctx.runnerTemp })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
});
