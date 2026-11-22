import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-conversation-image-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  return {
    repoPath: directory,
    binPath: join(directory, 'bin'),
    scriptPath: join(import.meta.dir, 'check-conversation-image.ts'),
    versionArgs: [
      'run',
      '--rm',
      '--network',
      'none',
      '--entrypoint',
      '/app/claude',
      'r/nixie-conversation@sha256:cc33',
      '--version',
    ],
    modulesArgs: [
      'run',
      '--rm',
      '--network',
      'none',
      '--entrypoint',
      'test',
      'r/nixie-conversation@sha256:cc33',
      '-e',
      '/app/node_modules',
    ],
  };
}

test('it passes when the CLI runs and the image holds no node_modules', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'docker', {
    answers: [{ args: ctx.modulesArgs, exitCode: 1 }, { args: [] }],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, CONVERSATION: 'r/nixie-conversation@sha256:cc33' })
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, calls: readStubCalls(ctx.binPath) }).toMatchObject({
    exitCode: 0,
    calls: [
      { name: 'docker', argv: ctx.versionArgs },
      { name: 'docker', argv: ctx.modulesArgs },
    ],
  });
});

test('it fails when the CLI does not run', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'docker', {
    answers: [{ args: ctx.versionArgs, exitCode: 1 }, { args: [] }],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, CONVERSATION: 'r/nixie-conversation@sha256:cc33' })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
});

test('it fails when the image holds node_modules', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'docker');

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, CONVERSATION: 'r/nixie-conversation@sha256:cc33' })
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 1,
    stdout: '::error::the conversation image holds /app/node_modules\n',
  });
});

test('it fails when the node_modules check does not run', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'docker', {
    answers: [{ args: ctx.modulesArgs, exitCode: 125 }, { args: [] }],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, CONVERSATION: 'r/nixie-conversation@sha256:cc33' })
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 1,
    stdout: '::error::the check for /app/node_modules did not run\n',
  });
});
