import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-codex-image-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');

  writeFileSync(callsPath, '');

  return {
    repoPath: directory,
    binPath: join(directory, 'bin'),
    callsPath,
    scriptPath: join(import.meta.dir, 'check-codex-image.ts'),
    versionCall: 'run --rm --network none --entrypoint codex r/nixie-codex@sha256:ee55 --version',
  };
}

test('it passes when the image prints the pinned version', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: { [ctx.versionCall]: { stdout: 'codex-cli 0.166.0\n' } },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, CODEX: 'r/nixie-codex@sha256:ee55' })
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, calls: readFileSync(ctx.callsPath, 'utf8') }).toStrictEqual({
    exitCode: 0,
    calls: `docker ${ctx.versionCall}\n`,
  });
});

test('it fails when the image prints another version', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: { [ctx.versionCall]: { stdout: 'codex-cli 0.165.0\n' } },
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

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: { [ctx.versionCall]: { exitCode: 1 } },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, CODEX: 'r/nixie-codex@sha256:ee55' })
    .nothrow()
    .quiet();

  expect(result.exitCode).not.toBe(0);
});
