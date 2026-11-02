import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-restic-lane-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');
  const runnerTemp = join(directory, 'runner-temp');

  mkdirSync(runnerTemp);
  writeFileSync(callsPath, '');

  return {
    runnerTemp,
    binPath: join(directory, 'bin'),
    callsPath,
    scriptPath: join(import.meta.dir, 'run-restic-lane.ts'),
  };
}

test('it copies the restic out of the backup image and runs the lane on it', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: { 'create r/nixie-backup@sha256:ab12': { stdout: 'c0ffee\n' } },
  });

  createStubProgram(join(ctx.binPath, 'bun'), { callsPath: ctx.callsPath });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({ PATH: ctx.binPath, BACKUP: 'r/nixie-backup@sha256:ab12', RUNNER_TEMP: ctx.runnerTemp })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(ctx.callsPath, 'utf8')).toBe(
    [
      'docker create r/nixie-backup@sha256:ab12',
      `docker cp c0ffee:/usr/local/bin/restic ${ctx.runnerTemp}/restic`,
      'docker rm c0ffee',
      'bun run test:restic',
      '',
    ].join('\n'),
  );
});

test('it fails when the lane fails', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: { 'create r/nixie-backup@sha256:ab12': { stdout: 'c0ffee\n' } },
  });

  createStubProgram(join(ctx.binPath, 'bun'), {
    callsPath: ctx.callsPath,
    answers: { 'run test:restic': { exitCode: 1 } },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({ PATH: ctx.binPath, BACKUP: 'r/nixie-backup@sha256:ab12', RUNNER_TEMP: ctx.runnerTemp })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
});
