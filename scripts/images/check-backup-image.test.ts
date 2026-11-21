import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-backup-image-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  mkdirSync(join(directory, 'apps', 'backup-job'), { recursive: true });

  return {
    repoPath: directory,
    binPath: join(directory, 'bin'),
    scriptPath: join(import.meta.dir, 'check-backup-image.ts'),
  };
}

test('it passes when the image runs the pinned restic and starts the job with no network', async () => {
  const ctx = setupTest();

  writeFileSync(
    join(ctx.repoPath, 'apps', 'backup-job', 'binaries.txt'),
    '# name, version, URL, SHA-256\nrestic 0.19.1 https://example.test/restic.bz2 aa11\n',
  );

  createStubBin(ctx.binPath, 'docker', {
    answers: [
      {
        args: [
          'run',
          '--rm',
          '--network',
          'none',
          '--entrypoint',
          'restic',
          'r/nixie-backup@sha256:cc33',
          'version',
        ],
        stdout: 'restic 0.19.1 compiled with go1.25.0 on linux/amd64\n',
      },
      { args: [] },
    ],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, BACKUP: 'r/nixie-backup@sha256:cc33' })
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, calls: readStubCalls(ctx.binPath) }).toMatchObject({
    exitCode: 0,
    calls: [
      {
        name: 'docker',
        argv: [
          'run',
          '--rm',
          '--network',
          'none',
          '--entrypoint',
          'restic',
          'r/nixie-backup@sha256:cc33',
          'version',
        ],
      },
      {
        name: 'docker',
        argv: [
          'run',
          '--rm',
          '--network',
          'none',
          '--read-only',
          'r/nixie-backup@sha256:cc33',
          '--help',
        ],
      },
    ],
  });
});

test('it fails when the image runs another restic than the binaries file pins', async () => {
  const ctx = setupTest();

  writeFileSync(
    join(ctx.repoPath, 'apps', 'backup-job', 'binaries.txt'),
    'restic 0.19.1 https://example.test/restic.bz2 aa11\n',
  );

  createStubBin(ctx.binPath, 'docker', {
    answers: [
      {
        args: [
          'run',
          '--rm',
          '--network',
          'none',
          '--entrypoint',
          'restic',
          'r/nixie-backup@sha256:cc33',
          'version',
        ],
        stdout: 'restic 0.18.0 compiled with go1.24.0 on linux/amd64\n',
      },
      { args: [] },
    ],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, BACKUP: 'r/nixie-backup@sha256:cc33' })
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 1,
    stdout:
      'restic 0.18.0 compiled with go1.24.0 on linux/amd64\n' +
      '::error::the backup image runs another restic than apps/backup-job/binaries.txt pins\n',
  });
});

test('it fails when the job does not start in the image', async () => {
  const ctx = setupTest();

  writeFileSync(
    join(ctx.repoPath, 'apps', 'backup-job', 'binaries.txt'),
    'restic 0.19.1 https://example.test/restic.bz2 aa11\n',
  );

  createStubBin(ctx.binPath, 'docker', {
    answers: [
      {
        args: [
          'run',
          '--rm',
          '--network',
          'none',
          '--entrypoint',
          'restic',
          'r/nixie-backup@sha256:cc33',
          'version',
        ],
        stdout: 'restic 0.19.1 compiled with go1.25.0 on linux/amd64\n',
      },
      {
        args: [
          'run',
          '--rm',
          '--network',
          'none',
          '--read-only',
          'r/nixie-backup@sha256:cc33',
          '--help',
        ],
        exitCode: 1,
      },
      { args: [] },
    ],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, BACKUP: 'r/nixie-backup@sha256:cc33' })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
});
