import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-backup-published-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');
  const summaryPath = join(directory, 'summary');

  mkdirSync(join(directory, 'deploy', 'compose'), { recursive: true });
  writeFileSync(callsPath, '');
  writeFileSync(summaryPath, '');

  return {
    repoPath: directory,
    binPath: join(directory, 'bin'),
    callsPath,
    summaryPath,
    scriptPath: join(import.meta.dir, 'check-backup-published.ts'),
  };
}

test('it prints the published set that nixie logged and adds it to the summary', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: {
      'compose -f compose.yaml -f ci/compose.yaml logs --no-color nixie': {
        stdout:
          'nixie-1  | {"event":"backup.set_staged","sequence":1}\nnixie-1  | {"event":"backup.set_published","sequence":1}\n',
      },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, GITHUB_STEP_SUMMARY: ctx.summaryPath })
    .nothrow()
    .quiet();

  const published = 'nixie-1  | {"event":"backup.set_published","sequence":1}\n';

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe(published);
  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe(published);
});

test('it fails once nixie logs no published set in any read', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: {
      'compose -f compose.yaml -f ci/compose.yaml logs --no-color nixie': {
        stdout: 'nixie-1  | {"event":"backup.set_staged","sequence":1}\n',
      },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, GITHUB_STEP_SUMMARY: ctx.summaryPath, POLL_MS: '10', READS: '3' })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toBe(
    '::error::nixie recorded no published backup set within 0.03 s\n',
  );

  expect(readFileSync(ctx.callsPath, 'utf8')).toBe(
    'docker compose -f compose.yaml -f ci/compose.yaml logs --no-color nixie\n'.repeat(3),
  );
});
