import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-public-pulls-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  mkdirSync(join(directory, 'apps', 'server'), { recursive: true });

  writeFileSync(
    join(directory, 'apps', 'server', 'sandbox-manifest.json'),
    '{"conversation":"r/nixie-conversation@sha256:aa11","fetch":"r/nixie-fetch@sha256:bb22"}\n',
  );

  return {
    repoPath: directory,
    binPath: join(directory, 'bin'),
    scriptPath: join(import.meta.dir, 'check-public-pulls.ts'),
  };
}

test('it pulls each image of the committed manifest when the step passes no manifest', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'bash');

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readStubCalls(ctx.binPath)).toMatchObject([
    {
      name: 'bash',
      argv: [
        '.github/scripts/check-public-pulls.sh',
        'r/nixie-conversation@sha256:aa11',
        'r/nixie-fetch@sha256:bb22',
      ],
    },
  ]);
});

test('it pulls each image of the manifest that the step passes in its env', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'bash');

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({
      PATH: ctx.binPath,
      SANDBOX_MANIFEST: '{"conversation":"r/nixie-conversation@sha256:cc33"}',
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readStubCalls(ctx.binPath)).toMatchObject([
    {
      name: 'bash',
      argv: ['.github/scripts/check-public-pulls.sh', 'r/nixie-conversation@sha256:cc33'],
    },
  ]);
});

test('it exits with the exit code of a failing pull script', async () => {
  const ctx = setupTest();

  createStubBin(ctx.binPath, 'bash', {
    answers: [
      {
        args: [
          '.github/scripts/check-public-pulls.sh',
          'r/nixie-conversation@sha256:aa11',
          'r/nixie-fetch@sha256:bb22',
        ],
        exitCode: 42,
      },
    ],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(42);
});
