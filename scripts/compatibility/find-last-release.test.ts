import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin } from '@zgeoff/testing/bin';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-last-release-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const outputPath = join(directory, 'output');
  const summaryPath = join(directory, 'summary');

  writeFileSync(outputPath, '');
  writeFileSync(summaryPath, '');

  return {
    binPath: join(directory, 'bin'),
    outputPath,
    summaryPath,
    scriptPath: join(import.meta.dir, 'find-last-release.ts'),
  };
}

test('it outputs the newest release tag reachable from the base', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'git', {
    answers: [
      {
        args: ['describe', '--tags', '--abbrev=0', '--match', 'v*', 'origin/main'],
        stdout: 'v0.58.0\n',
      },
    ],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      BASE: 'origin/main',
      GITHUB_OUTPUT: ctx.outputPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
  expect(readFileSync(ctx.outputPath, 'utf8')).toBe('tag=v0.58.0\n');
  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe('Last release: v0.58.0\n');
});

test('it outputs an empty tag when no release is reachable', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'git', {
    answers: [
      { args: ['describe', '--tags', '--abbrev=0', '--match', 'v*', 'origin/main'], exitCode: 128 },
    ],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      BASE: 'origin/main',
      GITHUB_OUTPUT: ctx.outputPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
  expect(readFileSync(ctx.outputPath, 'utf8')).toBe('tag=\n');
  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe('Last release: none yet\n');
});
