import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-public-pulls-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');

  writeFileSync(callsPath, '');
  mkdirSync(join(directory, 'apps', 'server'), { recursive: true });

  writeFileSync(
    join(directory, 'apps', 'server', 'sandbox-manifest.json'),
    '{"conversation":"r/nixie-conversation@sha256:aa11","fetch":"r/nixie-fetch@sha256:bb22"}\n',
  );

  return {
    repoPath: directory,
    callsPath,
    binPath: join(directory, 'bin'),
    scriptPath: join(import.meta.dir, 'check-public-pulls.ts'),
  };
}

test('it pulls each image of the committed manifest when the step passes no manifest', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'bash'), { callsPath: ctx.callsPath });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(ctx.callsPath, 'utf8')).toBe(
    'bash .github/scripts/check-public-pulls.sh r/nixie-conversation@sha256:aa11 r/nixie-fetch@sha256:bb22\n',
  );
});

test('it pulls each image of the manifest that the step passes in its env', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'bash'), { callsPath: ctx.callsPath });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({
      PATH: ctx.binPath,
      SANDBOX_MANIFEST: '{"conversation":"r/nixie-conversation@sha256:cc33"}',
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(ctx.callsPath, 'utf8')).toBe(
    'bash .github/scripts/check-public-pulls.sh r/nixie-conversation@sha256:cc33\n',
  );
});

test('it fails when an image does not pull', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'bash'), {
    callsPath: ctx.callsPath,
    answers: {
      '.github/scripts/check-public-pulls.sh r/nixie-conversation@sha256:aa11 r/nixie-fetch@sha256:bb22':
        { exitCode: 1 },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
});
