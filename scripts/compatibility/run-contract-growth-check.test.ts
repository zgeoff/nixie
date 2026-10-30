import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-contract-growth-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');

  writeFileSync(callsPath, '');

  return {
    runnerTemp: directory,
    binPath: join(directory, 'bin'),
    callsPath,
    scriptPath: join(import.meta.dir, 'run-contract-growth-check.ts'),
  };
}

test('it builds the contract, then checks it against the one the last release committed', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'bun'), { callsPath: ctx.callsPath });

  createStubProgram(join(ctx.binPath, 'git'), {
    callsPath: ctx.callsPath,
    answers: { 'show v0.58.0:libs/contract/openapi.json': { stdout: '{"openapi":"3.1.0"}\n' } },
  });

  createStubProgram(join(ctx.binPath, 'bash'), { callsPath: ctx.callsPath });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({ PATH: ctx.binPath, TAG: 'v0.58.0', RUNNER_TEMP: ctx.runnerTemp })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(join(ctx.runnerTemp, 'last-openapi.json'), 'utf8')).toBe(
    '{"openapi":"3.1.0"}\n',
  );

  expect(readFileSync(ctx.callsPath, 'utf8')).toBe(
    [
      'bun run --cwd libs/contract openapi',
      'git show v0.58.0:libs/contract/openapi.json',
      `bash .github/scripts/check-contract-growth.sh ${ctx.runnerTemp}/last-openapi.json libs/contract/openapi.json libs/contract/accepted-breaks.txt`,
      '',
    ].join('\n'),
  );
});

test('it fails with the exit code of the growth check', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'bun'), { callsPath: ctx.callsPath });
  createStubProgram(join(ctx.binPath, 'git'), { callsPath: ctx.callsPath });

  createStubProgram(join(ctx.binPath, 'bash'), {
    callsPath: ctx.callsPath,
    answers: {
      [`.github/scripts/check-contract-growth.sh ${ctx.runnerTemp}/last-openapi.json libs/contract/openapi.json libs/contract/accepted-breaks.txt`]:
        { exitCode: 1 },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({ PATH: ctx.binPath, TAG: 'v0.58.0', RUNNER_TEMP: ctx.runnerTemp })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
});
