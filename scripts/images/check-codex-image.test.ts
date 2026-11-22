import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-codex-image-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  return {
    repoPath: directory,
    binPath: join(directory, 'bin'),
    scriptPath: join(import.meta.dir, 'check-codex-image.ts'),
    versionArgs: [
      'run',
      '--rm',
      '--network',
      'none',
      '--entrypoint',
      'codex',
      'r/nixie-codex@sha256:ee55',
      '--version',
    ],
  };
}

test('it passes when the image prints the pinned version', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'docker', {
    answers: [{ args: ctx.versionArgs, stdout: 'codex-cli 0.166.0\n' }],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, CODEX: 'r/nixie-codex@sha256:ee55' })
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, calls: readStubCalls(ctx.binPath) }).toMatchObject({
    exitCode: 0,
    calls: [{ name: 'docker', argv: ctx.versionArgs }],
  });
});

test('it fails when the image prints another version', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'docker', {
    answers: [{ args: ctx.versionArgs, stdout: 'codex-cli 0.165.0\n' }],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, CODEX: 'r/nixie-codex@sha256:ee55' })
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 1,
    stdout: '::error::the codex image prints "codex-cli 0.165.0", not codex-cli 0.166.0\n',
  });
});

test('it fails when the image does not run', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'docker', { answers: [{ args: ctx.versionArgs, exitCode: 1 }] });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, CODEX: 'r/nixie-codex@sha256:ee55' })
    .nothrow()
    .quiet();

  expect(result.exitCode).not.toBe(0);
});
