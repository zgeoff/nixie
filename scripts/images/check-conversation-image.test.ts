import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-conversation-image-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');

  writeFileSync(callsPath, '');

  return {
    repoPath: directory,
    binPath: join(directory, 'bin'),
    callsPath,
    scriptPath: join(import.meta.dir, 'check-conversation-image.ts'),
    versionCall:
      'run --rm --network none --entrypoint /app/claude r/nixie-conversation@sha256:cc33 --version',
    modulesCall:
      'run --rm --network none --entrypoint test r/nixie-conversation@sha256:cc33 -e /app/node_modules',
  };
}

test('it passes when the CLI runs and the image holds no node_modules', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: { [ctx.modulesCall]: { exitCode: 1 } },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, CONVERSATION: 'r/nixie-conversation@sha256:cc33' })
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, calls: readFileSync(ctx.callsPath, 'utf8') }).toStrictEqual({
    exitCode: 0,
    calls: `docker ${ctx.versionCall}\ndocker ${ctx.modulesCall}\n`,
  });
});

test('it fails when the CLI does not run', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: { [ctx.versionCall]: { exitCode: 1 } },
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

  createStubProgram(join(ctx.binPath, 'docker'), { callsPath: ctx.callsPath });

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

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: { [ctx.modulesCall]: { exitCode: 125 } },
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
