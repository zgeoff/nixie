import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-check-task-yaml-format-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');
  const tempPath = join(directory, 'temp');

  writeFileSync(callsPath, '');
  mkdirSync(tempPath);

  return {
    binPath: join(directory, 'bin'),
    callsPath,
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

  createStubProgram(join(ctx.binPath, 'bun'), { callsPath: ctx.callsPath });
  createStubProgram(join(ctx.binPath, 'oxfmt'), { callsPath: ctx.callsPath });

  const result = await ctx.runScript();

  expect({
    exitCode: result.exitCode,
    calls: readFileSync(ctx.callsPath, 'utf8'),
    left: readdirSync(ctx.tempPath),
  }).toStrictEqual({
    exitCode: 0,
    calls: expect.stringMatching(
      /^bun modules\/definitions\/src\/run-task-yaml-samples\.ts \S+\/nixie-task-yaml-format-\w+\noxfmt --check \.\n$/u,
    ),
    left: [],
  });
});

test('it fails with the exit code of the formatter check', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'bun'), { callsPath: ctx.callsPath });

  createStubProgram(join(ctx.binPath, 'oxfmt'), {
    callsPath: ctx.callsPath,
    answers: { '--check .': { exitCode: 1 } },
  });

  const result = await ctx.runScript();

  expect(result.exitCode).toBe(1);
});

test('it skips the formatter check when the samples fail to write', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'oxfmt'), { callsPath: ctx.callsPath });

  // the stub answers by exact arguments, and the samples' folder name is random
  writeFileSync(join(ctx.binPath, 'bun'), '#!/bin/sh\nexit 3\n', { mode: 0o755 });

  const result = await ctx.runScript();

  expect({ exitCode: result.exitCode, calls: readFileSync(ctx.callsPath, 'utf8') }).toStrictEqual({
    exitCode: 3,
    calls: '',
  });
});
