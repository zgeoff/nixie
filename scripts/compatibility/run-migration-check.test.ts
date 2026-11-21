import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-migration-check-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const summaryPath = join(directory, 'summary');

  writeFileSync(summaryPath, '');

  return {
    runnerTemp: directory,
    binPath: join(directory, 'bin'),
    summaryPath,
    scriptPath: join(import.meta.dir, 'run-migration-check.ts'),
  };
}

test('it checks the migrations against the schema the last release reads', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'bash');

  createStubBin(ctx.binPath, 'bun', {
    answers: [
      {
        args: [
          'libs/db/src/run-migration-check.ts',
          '--released',
          `${ctx.runnerTemp}/released.json`,
          '--last-tag',
          'v0.58.0',
        ],
        stdout: '2 migrations since v0.58.0, each readable by it\n',
      },
    ],
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

  expect(readStubCalls(ctx.binPath)).toMatchObject([
    {
      name: 'bash',
      argv: [
        '.github/scripts/read-released-schema.sh',
        'v0.58.0',
        `${ctx.runnerTemp}/released.json`,
      ],
    },
    {
      name: 'bun',
      argv: [
        'libs/db/src/run-migration-check.ts',
        '--released',
        `${ctx.runnerTemp}/released.json`,
        '--last-tag',
        'v0.58.0',
      ],
    },
  ]);

  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe(
    '2 migrations since v0.58.0, each readable by it\n',
  );
});

test('it runs the check with nothing to compare before the first release', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'bash');
  createStubBin(ctx.binPath, 'bun');

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

  expect(readStubCalls(ctx.binPath)).toMatchObject([
    { name: 'bun', argv: ['libs/db/src/run-migration-check.ts'] },
  ]);
});

test('it fails with the exit code of the migration check', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'bun', {
    answers: [{ args: ['libs/db/src/run-migration-check.ts'], exitCode: 1 }],
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
