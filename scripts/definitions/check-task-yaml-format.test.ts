import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-check-task-yaml-format-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const tempPath = join(directory, 'temp');

  mkdirSync(tempPath);

  return {
    binPath: join(directory, 'bin'),
    tempPath,
    runScript: () =>
      $`${process.execPath} ${join(import.meta.dir, 'check-task-yaml-format.ts')}`
        .env({ PATH: join(directory, 'bin'), TMPDIR: tempPath })
        .nothrow()
        .quiet(),
  };
}

test('it writes the samples, then runs the formatter check over them, and removes them', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'bun');
  createStubBin(ctx.binPath, 'oxfmt');

  const result = await ctx.runScript();

  expect({
    exitCode: result.exitCode,
    calls: readStubCalls(ctx.binPath),
    left: readdirSync(ctx.tempPath),
  }).toMatchObject({
    exitCode: 0,
    calls: [
      {
        name: 'bun',
        argv: [
          'modules/definitions/src/run-task-yaml-samples.ts',
          expect.stringMatching(/\/nixie-task-yaml-format-\w+$/u),
        ],
      },
      { name: 'oxfmt', argv: ['--check', '.'] },
    ],
    left: [],
  });
});

test('it fails with the exit code of the formatter check', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'bun');
  createStubBin(ctx.binPath, 'oxfmt', { answers: [{ args: ['--check', '.'], exitCode: 1 }] });

  const result = await ctx.runScript();

  expect(result.exitCode).toBe(1);
});

test('it skips the formatter check when the samples fail to write', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'oxfmt');

  // the stub answers by exact arguments, and the samples' folder name is random
  writeFileSync(join(ctx.binPath, 'bun'), '#!/bin/sh\nexit 3\n', { mode: 0o755 });

  const result = await ctx.runScript();

  expect({ exitCode: result.exitCode, calls: readStubCalls(ctx.binPath) }).toStrictEqual({
    exitCode: 3,
    calls: [],
  });
});
