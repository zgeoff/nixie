import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-age-key-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');

  mkdirSync(join(directory, 'deploy', 'compose'), { recursive: true });
  writeFileSync(callsPath, '');

  return {
    repoPath: directory,
    binPath: join(directory, 'bin'),
    callsPath,
    ageKeyFile: join(directory, 'age.key'),
    scriptPath: join(import.meta.dir, 'check-age-key.ts'),
  };
}

test('it passes when nixie reads the same key, owned by its user alone', async () => {
  const ctx = setupTest();

  writeFileSync(ctx.ageKeyFile, 'invented-age-key\n');

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: {
      'compose -f compose.yaml -f ci/compose.yaml exec -T nixie cat /etc/nixie/secrets/age.key': {
        stdout: 'invented-age-key\n',
      },
      'compose -f compose.yaml -f ci/compose.yaml exec -T nixie stat -c %a %u /etc/nixie/secrets/age.key':
        { stdout: '400 10001\n' },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, NIXIE_AGE_KEY_FILE: ctx.ageKeyFile })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
});

test('it fails when nixie reads another key', async () => {
  const ctx = setupTest();

  writeFileSync(ctx.ageKeyFile, 'invented-age-key\n');

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: {
      'compose -f compose.yaml -f ci/compose.yaml exec -T nixie cat /etc/nixie/secrets/age.key': {
        stdout: 'another-age-key\n',
      },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, NIXIE_AGE_KEY_FILE: ctx.ageKeyFile })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toBe(
    '::error::nixie reads another age key at /etc/nixie/secrets/age.key\n',
  );
});

test('it fails when another user can read the key', async () => {
  const ctx = setupTest();

  writeFileSync(ctx.ageKeyFile, 'invented-age-key\n');

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: {
      'compose -f compose.yaml -f ci/compose.yaml exec -T nixie cat /etc/nixie/secrets/age.key': {
        stdout: 'invented-age-key\n',
      },
      'compose -f compose.yaml -f ci/compose.yaml exec -T nixie stat -c %a %u /etc/nixie/secrets/age.key':
        { stdout: '444 10001\n' },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, NIXIE_AGE_KEY_FILE: ctx.ageKeyFile })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toBe(
    '::error::/etc/nixie/secrets/age.key has mode and owner 444 10001, not 400 10001\n',
  );
});
