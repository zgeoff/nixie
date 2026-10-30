import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-carried-manifest-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');
  const runnerTemp = join(directory, 'runner-temp');

  mkdirSync(join(directory, 'apps', 'server'), { recursive: true });
  mkdirSync(runnerTemp);
  writeFileSync(callsPath, '');

  return {
    repoPath: directory,
    runnerTemp,
    binPath: join(directory, 'bin'),
    callsPath,
    scriptPath: join(import.meta.dir, 'check-carried-manifest.ts'),
  };
}

test('it passes when the image carries the written manifest, in any key order', async () => {
  const ctx = setupTest();

  writeFileSync(
    join(ctx.repoPath, 'apps', 'server', 'sandbox-manifest.json'),
    '{"conversation":"r/nixie-conversation@sha256:aa11","fetch":"r/nixie-fetch@sha256:bb22"}\n',
  );

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: {
      'run --rm --entrypoint cat r/nixie@sha256:cc33 /app/sandbox-manifest.json': {
        stdout:
          '{"fetch":"r/nixie-fetch@sha256:bb22","conversation":"r/nixie-conversation@sha256:aa11"}\n',
      },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, NIXIE: 'r/nixie@sha256:cc33', RUNNER_TEMP: ctx.runnerTemp })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(join(ctx.runnerTemp, 'carried.json'), 'utf8')).toBe(
    '{"fetch":"r/nixie-fetch@sha256:bb22","conversation":"r/nixie-conversation@sha256:aa11"}\n',
  );
});

test('it fails when the image carries another manifest', async () => {
  const ctx = setupTest();

  writeFileSync(
    join(ctx.repoPath, 'apps', 'server', 'sandbox-manifest.json'),
    '{"conversation":"r/nixie-conversation@sha256:aa11","fetch":"r/nixie-fetch@sha256:bb22"}\n',
  );

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: {
      'run --rm --entrypoint cat r/nixie@sha256:cc33 /app/sandbox-manifest.json': {
        stdout:
          '{"conversation":"r/nixie-conversation@sha256:dd44","fetch":"r/nixie-fetch@sha256:bb22"}\n',
      },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, NIXIE: 'r/nixie@sha256:cc33', RUNNER_TEMP: ctx.runnerTemp })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toEndWith(
    '::error::the nixie image carries another sandbox manifest than apps/server/sandbox-manifest.json\n',
  );
});
