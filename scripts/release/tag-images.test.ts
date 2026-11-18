import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-tag-images-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');

  writeFileSync(callsPath, '');
  mkdirSync(join(directory, '.github', 'scripts'), { recursive: true });

  return {
    repoPath: directory,
    callsPath,
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

  createStubProgram(join(ctx.binPath, 'bash'), { callsPath: ctx.callsPath });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(ctx.callsPath, 'utf8')).toBe(
    'bash .github/scripts/tag-images.sh 1.2.3 r/nixie-conversation@sha256:aa11 r/nixie-fetch@sha256:bb22 r/nixie-backup@sha256:ab12 r/nixie-web@sha256:cc33 r/nixie@sha256:dd44\n',
  );
});

test('it exits with the exit code of a failing tag script', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'bash'), {
    callsPath: ctx.callsPath,
    answers: {
      '.github/scripts/tag-images.sh 1.2.3 r/nixie-conversation@sha256:aa11 r/nixie-fetch@sha256:bb22 r/nixie-backup@sha256:ab12 r/nixie-web@sha256:cc33 r/nixie@sha256:dd44':
        { exitCode: 42 },
    },
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

  createStubProgram(join(ctx.binPath, 'bash'), { callsPath: ctx.callsPath });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ ...ctx.env, VERSION: undefined })
    .nothrow()
    .quiet();

  expect(result.exitCode).not.toBe(0);
  expect(readFileSync(ctx.callsPath, 'utf8')).toBe('');
});
