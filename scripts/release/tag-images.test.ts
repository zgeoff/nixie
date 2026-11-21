import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-tag-images-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  mkdirSync(join(directory, '.github', 'scripts'), { recursive: true });

  return {
    repoPath: directory,
    binPath: join(directory, 'bin'),
    scriptPath: join(import.meta.dir, 'tag-images.ts'),
    env: {
      PATH: join(directory, 'bin'),
      VERSION: '1.2.3',
      SANDBOX_MANIFEST:
        '{"conversation":"r/nixie-conversation@sha256:aa11","fetch":"r/nixie-fetch@sha256:bb22"}',
      BACKUP: 'r/nixie-backup@sha256:ab12',
      WEB: 'r/nixie-web@sha256:cc33',
      NIXIE: 'r/nixie@sha256:dd44',
    },
  };
}

test('it tags the sandbox images first, then backup, web and nixie last', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'bash');

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readStubCalls(ctx.binPath)).toMatchObject([
    {
      name: 'bash',
      argv: [
        '.github/scripts/tag-images.sh',
        '1.2.3',
        'r/nixie-conversation@sha256:aa11',
        'r/nixie-fetch@sha256:bb22',
        'r/nixie-backup@sha256:ab12',
        'r/nixie-web@sha256:cc33',
        'r/nixie@sha256:dd44',
      ],
    },
  ]);
});

test('it exits with the exit code of a failing tag script', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'bash', {
    answers: [
      {
        args: [
          '.github/scripts/tag-images.sh',
          '1.2.3',
          'r/nixie-conversation@sha256:aa11',
          'r/nixie-fetch@sha256:bb22',
          'r/nixie-backup@sha256:ab12',
          'r/nixie-web@sha256:cc33',
          'r/nixie@sha256:dd44',
        ],
        exitCode: 42,
      },
    ],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(42);
});

test('it fails when the step leaves out the version', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'bash');

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ ...ctx.env, VERSION: undefined })
    .nothrow()
    .quiet();

  expect(result.exitCode).not.toBe(0);
  expect(readStubCalls(ctx.binPath)).toStrictEqual([]);
});
