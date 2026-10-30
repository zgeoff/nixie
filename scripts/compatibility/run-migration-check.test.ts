import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-migration-check-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');
  const summaryPath = join(directory, 'summary');

  writeFileSync(callsPath, '');
  writeFileSync(summaryPath, '');

  return {
    runnerTemp: directory,
    binPath: join(directory, 'bin'),
    callsPath,
    summaryPath,
    scriptPath: join(import.meta.dir, 'run-migration-check.ts'),
  };
}

test('it checks the migrations against the schema the last release reads', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'bash'), { callsPath: ctx.callsPath });

  createStubProgram(join(ctx.binPath, 'bun'), {
    callsPath: ctx.callsPath,
    answers: {
      [`libs/db/src/run-migration-check.ts --released ${ctx.runnerTemp}/released.json --last-tag v0.58.0`]:
        { stdout: '2 migrations since v0.58.0, each readable by it\n' },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      TAG: 'v0.58.0',
      RUNNER_TEMP: ctx.runnerTemp,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(ctx.callsPath, 'utf8')).toBe(
    [
      `bash .github/scripts/read-released-schema.sh v0.58.0 ${ctx.runnerTemp}/released.json`,
      `bun libs/db/src/run-migration-check.ts --released ${ctx.runnerTemp}/released.json --last-tag v0.58.0`,
      '',
    ].join('\n'),
  );

  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe(
    '2 migrations since v0.58.0, each readable by it\n',
  );
});

test('it runs the check with nothing to compare before the first release', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'bash'), { callsPath: ctx.callsPath });
  createStubProgram(join(ctx.binPath, 'bun'), { callsPath: ctx.callsPath });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      TAG: '',
      RUNNER_TEMP: ctx.runnerTemp,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
  expect(readFileSync(ctx.callsPath, 'utf8')).toBe('bun libs/db/src/run-migration-check.ts\n');
});

test('it fails with the exit code of the migration check', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'bun'), {
    callsPath: ctx.callsPath,
    answers: { 'libs/db/src/run-migration-check.ts': { exitCode: 1 } },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      TAG: '',
      RUNNER_TEMP: ctx.runnerTemp,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
});
