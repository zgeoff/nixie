import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-model-gateway-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const summaryPath = join(directory, 'summary');
  const runnerTemp = join(directory, 'runner-temp');

  mkdirSync(runnerTemp);
  writeFileSync(summaryPath, '');

  return {
    runnerTemp,
    binPath: join(directory, 'bin'),
    summaryPath,
    scriptPath: join(import.meta.dir, 'publish-model-gateway.ts'),
  };
}

test('it builds the release binary and uploads it in place of an earlier attempt', async () => {
  const ctx = setupTest();

  // the binary that the stubbed build would write
  writeFileSync(join(ctx.runnerTemp, 'model-gateway-linux-x64'), 'invented binary');
  createStubBin(ctx.binPath, 'bun');
  createStubBin(ctx.binPath, 'gh');

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

  expect(readStubCalls(ctx.binPath)).toMatchObject([
    {
      name: 'bun',
      argv: [
        'build',
        '--compile',
        '--target=bun-linux-x64',
        '--define',
        'NIXIE_TEST_BUILD=false',
        'apps/model-gateway/src/main.ts',
        '--outfile',
        `${ctx.runnerTemp}/model-gateway-linux-x64`,
      ],
    },
    {
      name: 'gh',
      argv: [
        'release',
        'upload',
        'v0.59.0',
        `${ctx.runnerTemp}/model-gateway-linux-x64`,
        '--clobber',
      ],
    },
  ]);
});

test('it writes the binary sha256 to the summary', async () => {
  const ctx = setupTest();

  writeFileSync(join(ctx.runnerTemp, 'model-gateway-linux-x64'), 'invented binary');
  createStubBin(ctx.binPath, 'bun');
  createStubBin(ctx.binPath, 'gh');

  await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      TAG: 'v0.59.0',
      RUNNER_TEMP: ctx.runnerTemp,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .quiet();

  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe(
    'model-gateway-linux-x64 sha256: 1352774f1a9f8522babf237e03a2293c5c11383a82a2b750bd06ee916a1f813e\n',
  );
});
