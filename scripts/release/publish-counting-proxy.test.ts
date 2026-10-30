import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-counting-proxy-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');
  const summaryPath = join(directory, 'summary');
  const runnerTemp = join(directory, 'runner-temp');

  mkdirSync(runnerTemp);
  writeFileSync(callsPath, '');
  writeFileSync(summaryPath, '');

  return {
    runnerTemp,
    binPath: join(directory, 'bin'),
    callsPath,
    summaryPath,
    scriptPath: join(import.meta.dir, 'publish-counting-proxy.ts'),
  };
}

test('it builds the release binary and uploads it in place of an earlier attempt', async () => {
  const ctx = setupTest();

  // the binary that the stubbed build would write
  writeFileSync(join(ctx.runnerTemp, 'counting-proxy-linux-x64'), 'invented binary');
  createStubProgram(join(ctx.binPath, 'bun'), { callsPath: ctx.callsPath });
  createStubProgram(join(ctx.binPath, 'gh'), { callsPath: ctx.callsPath });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      TAG: 'v0.59.0',
      RUNNER_TEMP: ctx.runnerTemp,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(ctx.callsPath, 'utf8')).toBe(
    [
      `bun build --compile --target=bun-linux-x64 --define NIXIE_TEST_BUILD=false apps/counting-proxy/src/main.ts --outfile ${ctx.runnerTemp}/counting-proxy-linux-x64`,
      `gh release upload v0.59.0 ${ctx.runnerTemp}/counting-proxy-linux-x64 --clobber`,
      '',
    ].join('\n'),
  );
});

test('it writes the binary sha256 to the summary', async () => {
  const ctx = setupTest();

  writeFileSync(join(ctx.runnerTemp, 'counting-proxy-linux-x64'), 'invented binary');
  createStubProgram(join(ctx.binPath, 'bun'), { callsPath: ctx.callsPath });
  createStubProgram(join(ctx.binPath, 'gh'), { callsPath: ctx.callsPath });

  await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      TAG: 'v0.59.0',
      RUNNER_TEMP: ctx.runnerTemp,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .quiet();

  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe(
    'counting-proxy-linux-x64 sha256: 1352774f1a9f8522babf237e03a2293c5c11383a82a2b750bd06ee916a1f813e\n',
  );
});
