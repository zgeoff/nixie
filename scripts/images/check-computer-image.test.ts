import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { $ } from 'bun';
import { mediaProbe } from './media-probe.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-computer-image-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  return {
    repoPath: directory,
    binPath: join(directory, 'bin'),
    scriptPath: join(import.meta.dir, 'check-computer-image.ts'),
    runArgs: [
      'run',
      '--rm',
      '--network',
      'none',
      '--user',
      '1002:1002',
      '--memory',
      '1536m',
      '--memory-swap',
      '1536m',
      '--cpus',
      '2',
      '--entrypoint',
      'sh',
      'r/nixie-computer@sha256:ee55',
      '-c',
      mediaProbe,
    ],
  };
}

test('it runs the media probe as the terminal inside the computer sandbox limits', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'docker', { answers: [{ args: ctx.runArgs, stdout: '' }] });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, COMPUTER: 'r/nixie-computer@sha256:ee55' })
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    calls: readStubCalls(ctx.binPath),
  }).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: '',
    calls: [{ name: 'docker', argv: ctx.runArgs, stdin: '', cwd: expect.any(String), env: {} }],
  });
});

test('it fails when a media tool fails in the image', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'docker', {
    answers: [{ args: ctx.runArgs, exitCode: 127, stderr: 'ffmpeg: not found' }],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, COMPUTER: 'r/nixie-computer@sha256:ee55' })
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      "::error::the terminal's account cannot run the computer image's media tools: ffmpeg: not found\n",
    stderr: '',
  });
});
