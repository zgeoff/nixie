import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-config-schema-check-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const summaryPath = join(directory, 'summary');

  writeFileSync(summaryPath, '');

  return {
    runnerTemp: directory,
    binPath: join(directory, 'bin'),
    summaryPath,
    scriptPath: join(import.meta.dir, 'run-config-schema-check.ts'),
  };
}

test('it checks the schema against the base, with the pull request title', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'git', {
    answers: [
      {
        args: ['show', 'origin/main:apps/server/config.schema.json'],
        stdout: '{"type":"object"}\n',
      },
    ],
  });

  createStubBin(ctx.binPath, 'bun', {
    answers: [
      {
        args: [
          'apps/server/src/run-config-schema-check.ts',
          '--released',
          `${ctx.runnerTemp}/base-config.schema.json`,
          '--last-tag',
          'main',
          '--title',
          'feat(api)!: drop the legacy key',
        ],
        stdout: 'The config schema refuses a key the base accepts\n',
      },
    ],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      BASE: 'main',
      TITLE: 'feat(api)!: drop the legacy key',
      RUNNER_TEMP: ctx.runnerTemp,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(join(ctx.runnerTemp, 'base-config.schema.json'), 'utf8')).toBe(
    '{"type":"object"}\n',
  );

  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe(
    'The config schema refuses a key the base accepts\n',
  );
});

test('it runs the check with only the title when the base holds no schema', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'git', {
    answers: [{ args: ['show', 'origin/main:apps/server/config.schema.json'], exitCode: 128 }],
  });

  createStubBin(ctx.binPath, 'bun');

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      BASE: 'main',
      TITLE: 'feat(api): add a key',
      RUNNER_TEMP: ctx.runnerTemp,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readStubCalls(ctx.binPath)).toMatchObject([
    { name: 'git', argv: ['show', 'origin/main:apps/server/config.schema.json'] },
    {
      name: 'bun',
      argv: ['apps/server/src/run-config-schema-check.ts', '--title', 'feat(api): add a key'],
    },
  ]);
});

test('it fails with the exit code of the schema check', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'git', {
    answers: [{ args: ['show', 'origin/main:apps/server/config.schema.json'], exitCode: 128 }],
  });

  createStubBin(ctx.binPath, 'bun', {
    answers: [
      {
        args: ['apps/server/src/run-config-schema-check.ts', '--title', 'feat(api): add a key'],
        exitCode: 1,
      },
    ],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      BASE: 'main',
      TITLE: 'feat(api): add a key',
      RUNNER_TEMP: ctx.runnerTemp,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
});
