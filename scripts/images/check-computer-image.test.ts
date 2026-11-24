import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { $ } from 'bun';

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
      '512m',
      '--memory-swap',
      '512m',
      '--cpus',
      '2',
      '--entrypoint',
      'sh',
      'r/nixie-computer@sha256:ee55',
      '-c',
      [
        'set -eu',
        'ffmpeg -version',
        'magick -version',
        'cd "$(mktemp -d)"',
        'ffmpeg -loglevel error -f lavfi -i testsrc=duration=1:size=64x64:rate=5 -c:v libx264 -pix_fmt yuv420p clip.mp4',
        'test "$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 clip.mp4)" = h264',
        'ffmpeg -loglevel error -i clip.mp4 -vf scale=32:32 -c:v mpeg4 transcoded.mkv',
        'test "$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height -of csv=p=0 transcoded.mkv)" = mpeg4,32,32',
        'magick -size 64x64 gradient:red-blue input.png',
        'magick input.png -resize 32x32 output.png',
        'test "$(magick identify -format %wx%h output.png)" = 32x32',
      ].join('\n'),
    ],
  };
}

test('it runs the media probe as the terminal inside the computer sandbox limits', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'docker', {
    answers: [{ args: ctx.runArgs, stdout: '' }],
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
    calls: readStubCalls(ctx.binPath),
  }).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: '',
    calls: [
      {
        name: 'docker',
        argv: ctx.runArgs,
        cwd: ctx.repoPath,
        env: {},
        stdin: '',
      },
    ],
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
