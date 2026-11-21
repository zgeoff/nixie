import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-contract-growth-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  return {
    runnerTemp: directory,
    binPath: join(directory, 'bin'),
    scriptPath: join(import.meta.dir, 'run-contract-growth-check.ts'),
  };
}

test('it builds the contract, then checks it against the one the last release committed', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'bun');

  createStubBin(ctx.binPath, 'git', {
    answers: [
      { args: ['show', 'v0.58.0:libs/contract/openapi.json'], stdout: '{"openapi":"3.1.0"}\n' },
    ],
  });

  createStubBin(ctx.binPath, 'bash');

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({ PATH: ctx.binPath, TAG: 'v0.58.0', RUNNER_TEMP: ctx.runnerTemp })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(join(ctx.runnerTemp, 'last-openapi.json'), 'utf8')).toBe(
    '{"openapi":"3.1.0"}\n',
  );

  expect(readStubCalls(ctx.binPath)).toMatchObject([
    { name: 'bun', argv: ['run', '--cwd', 'libs/contract', 'openapi'] },
    { name: 'git', argv: ['show', 'v0.58.0:libs/contract/openapi.json'] },
    {
      name: 'bash',
      argv: [
        'scripts/compatibility/check-contract-growth.sh',
        `${ctx.runnerTemp}/last-openapi.json`,
        'libs/contract/openapi.json',
        'libs/contract/accepted-breaks.txt',
      ],
    },
  ]);
});

test('it fails with the exit code of the growth check', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'bun');
  createStubBin(ctx.binPath, 'git');

  createStubBin(ctx.binPath, 'bash', {
    answers: [
      {
        args: [
          'scripts/compatibility/check-contract-growth.sh',
          `${ctx.runnerTemp}/last-openapi.json`,
          'libs/contract/openapi.json',
          'libs/contract/accepted-breaks.txt',
        ],
        exitCode: 1,
      },
    ],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({ PATH: ctx.binPath, TAG: 'v0.58.0', RUNNER_TEMP: ctx.runnerTemp })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
});
