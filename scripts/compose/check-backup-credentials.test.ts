import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-backup-credentials-'));

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
    scriptPath: join(import.meta.dir, 'check-backup-credentials.ts'),
  };
}

test('it passes when only the backup service holds the backup variables and mounts only staging', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: {
      'compose -f compose.yaml -f ci/compose.yaml config --format json': {
        stdout: JSON.stringify({
          services: {
            nixie: { environment: { NIXIE_ORIGIN: 'http://127.0.0.1:8080' } },
            'nixie-backup': {
              environment: { NIXIE_BACKUP_DATA_PASSWORD: 'data-pass' },
              volumes: [{ source: 'data', target: '/backup', volume: { subpath: 'backup' } }],
            },
          },
        }),
      },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('the backup credentials stay apart\n');
});

test('it fails when the nixie service holds a backup variable', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: {
      'compose -f compose.yaml -f ci/compose.yaml config --format json': {
        stdout: JSON.stringify({
          services: {
            nixie: { environment: { NIXIE_BACKUP_KEY_PASSWORD: 'key-pass' } },
            'nixie-backup': {
              volumes: [{ source: 'data', target: '/backup', volume: { subpath: 'backup' } }],
            },
          },
        }),
      },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toBe('::error::the nixie service holds a backup variable\n');
});
