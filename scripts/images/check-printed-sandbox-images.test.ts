import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-printed-sandbox-images-'));

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
    scriptPath: join(import.meta.dir, 'check-printed-sandbox-images.ts'),
  };
}

test('it passes when nixie prints the manifest refs, each under its kind name', async () => {
  const ctx = setupTest();

  writeFileSync(
    join(ctx.repoPath, 'apps', 'server', 'sandbox-manifest.json'),
    '{"conversation":"r/nixie-conversation@sha256:aa11","fetch":"r/nixie-fetch@sha256:bb22"}\n',
  );

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: {
      'run --rm --network none --read-only --entrypoint nixie r/nixie@sha256:cc33 sandbox-manifest':
        {
          stdout: JSON.stringify({
            conversation: {
              ref: 'r/nixie-conversation@sha256:aa11',
              name: 'nixie-conversation-0123456789ab',
            },
            fetch: { ref: 'r/nixie-fetch@sha256:bb22', name: 'nixie-fetch-ba9876543210' },
          }),
        },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, NIXIE: 'r/nixie@sha256:cc33', RUNNER_TEMP: ctx.runnerTemp })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
});

test('it fails when nixie prints another ref than the manifest', async () => {
  const ctx = setupTest();

  writeFileSync(
    join(ctx.repoPath, 'apps', 'server', 'sandbox-manifest.json'),
    '{"conversation":"r/nixie-conversation@sha256:aa11","fetch":"r/nixie-fetch@sha256:bb22"}\n',
  );

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: {
      'run --rm --network none --read-only --entrypoint nixie r/nixie@sha256:cc33 sandbox-manifest':
        {
          stdout: JSON.stringify({
            conversation: {
              ref: 'r/nixie-conversation@sha256:aa11',
              name: 'nixie-conversation-0123456789ab',
            },
            fetch: { ref: 'r/nixie-fetch@sha256:ee55', name: 'nixie-fetch-ba9876543210' },
          }),
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
    '::error::nixie prints other sandbox images than apps/server/sandbox-manifest.json\n',
  );
});

test('it fails when nixie prints an image without its name', async () => {
  const ctx = setupTest();

  writeFileSync(
    join(ctx.repoPath, 'apps', 'server', 'sandbox-manifest.json'),
    '{"conversation":"r/nixie-conversation@sha256:aa11","fetch":"r/nixie-fetch@sha256:bb22"}\n',
  );

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: {
      'run --rm --network none --read-only --entrypoint nixie r/nixie@sha256:cc33 sandbox-manifest':
        {
          stdout: JSON.stringify({
            conversation: { ref: 'r/nixie-conversation@sha256:aa11' },
            fetch: { ref: 'r/nixie-fetch@sha256:bb22', name: 'nixie-fetch-ba9876543210' },
          }),
        },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, NIXIE: 'r/nixie@sha256:cc33', RUNNER_TEMP: ctx.runnerTemp })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toInclude('"conversation"');
});

test('it fails when a sandbox image name does not follow its kind', async () => {
  const ctx = setupTest();

  writeFileSync(
    join(ctx.repoPath, 'apps', 'server', 'sandbox-manifest.json'),
    '{"conversation":"r/nixie-conversation@sha256:aa11","fetch":"r/nixie-fetch@sha256:bb22"}\n',
  );

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: {
      'run --rm --network none --read-only --entrypoint nixie r/nixie@sha256:cc33 sandbox-manifest':
        {
          stdout: JSON.stringify({
            conversation: {
              ref: 'r/nixie-conversation@sha256:aa11',
              name: 'nixie-fetch-0123456789ab',
            },
            fetch: { ref: 'r/nixie-fetch@sha256:bb22', name: 'nixie-fetch-ba9876543210' },
          }),
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
    '::error::nixie names a sandbox image other than nixie-<kind>-<12 hex digits>: nixie-fetch-0123456789ab\n',
  );
});
