import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-sign-in-code-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  mkdirSync(join(directory, 'deploy', 'compose'), { recursive: true });
  mkdirSync(join(directory, 'preview'), { recursive: true });

  return {
    repoPath: directory,
    binPath: join(directory, 'bin'),
    scriptPath: join(import.meta.dir, 'check-sign-in-code.ts'),
  };
}

test('it prints the code that the recipe enrol run prints', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'docker', {
    answers: [
      {
        args: ['compose', '-f', 'compose.yaml', '-f', 'ci/compose.yaml', 'run', '--rm', 'enrol'],
        stdout: 'K7Q2M-9XW4T\nThe code works once, for 10 minutes.\n',
      },
    ],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath} recipe`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('K7Q2M-9XW4T\n');
});

test('it reads the code from the preview enrol service log', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'docker', {
    answers: [{ args: ['compose', 'logs', '--no-log-prefix', 'enrol'], stdout: 'P3R8D-2HN6V\n' }],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath} preview`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readStubCalls(ctx.binPath)).toMatchObject([
    { name: 'docker', argv: ['compose', 'logs', '--no-log-prefix', 'enrol'] },
  ]);
});

test('it fails when enrol prints no code', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'docker', {
    answers: [
      {
        args: ['compose', '-f', 'compose.yaml', '-f', 'ci/compose.yaml', 'run', '--rm', 'enrol'],
        stdout: 'error: nixie is not ready\n',
      },
    ],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath} recipe`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toBe('::error::enrol printed no sign-in code\n');
});

test('it prints its usage, and runs nothing, for a stack it does not know', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'docker');

  const result = await $`${process.execPath} ${ctx.scriptPath} staging`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toBe('usage: check-sign-in-code.ts <recipe|preview>\n');
  expect(readStubCalls(ctx.binPath)).toStrictEqual([]);
});
