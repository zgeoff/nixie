import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-tag-rehearsal-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');
  const summaryPath = join(directory, 'summary');

  writeFileSync(callsPath, '');
  writeFileSync(summaryPath, '');
  mkdirSync(join(directory, 'apps', 'server'), { recursive: true });

  writeFileSync(
    join(directory, 'apps', 'server', 'sandbox-manifest.json'),
    '{"conversation":"r/nixie-conversation@sha256:aa11","fetch":"r/nixie-fetch@sha256:bb22"}\n',
  );

  return {
    repoPath: directory,
    binPath: join(directory, 'bin'),
    callsPath,
    summaryPath,
    scriptPath: join(import.meta.dir, 'tag-rehearsal-images.ts'),
  };
}

test('it tags every image twice, sandbox images first and nixie last', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'bash'), { callsPath: ctx.callsPath });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({
      PATH: ctx.binPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
      BACKUP: 'r/nixie-backup@sha256:ab12',
      WEB: 'r/nixie-web@sha256:cc33',
      NIXIE: 'r/nixie@sha256:dd44',
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(ctx.callsPath, 'utf8')).toBe(
    [
      'bash .github/scripts/tag-images.sh 0.0.0-rehearsal r/nixie-conversation@sha256:aa11 r/nixie-fetch@sha256:bb22 r/nixie-backup@sha256:ab12 r/nixie-web@sha256:cc33 r/nixie@sha256:dd44',
      'bash .github/scripts/tag-images.sh 0.0.0-rehearsal r/nixie-conversation@sha256:aa11 r/nixie-fetch@sha256:bb22 r/nixie-backup@sha256:ab12 r/nixie-web@sha256:cc33 r/nixie@sha256:dd44',
      '',
    ].join('\n'),
  );
});

test('it lists each image and its digest in the summary', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'bash'), { callsPath: ctx.callsPath });

  await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({
      PATH: ctx.binPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
      BACKUP: 'r/nixie-backup@sha256:ab12',
      WEB: 'r/nixie-web@sha256:cc33',
      NIXIE: 'r/nixie@sha256:dd44',
    })
    .quiet();

  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe(
    [
      '| Image | Digest |',
      '| ----- | ------ |',
      '| `r/nixie-conversation` | `sha256:aa11` |',
      '| `r/nixie-fetch` | `sha256:bb22` |',
      '| `r/nixie-backup` | `sha256:ab12` |',
      '| `r/nixie-web` | `sha256:cc33` |',
      '| `r/nixie` | `sha256:dd44` |',
      '',
    ].join('\n'),
  );
});

test('it stops, and writes no summary, when the first tag run fails', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'bash'), {
    callsPath: ctx.callsPath,
    answers: {
      '.github/scripts/tag-images.sh 0.0.0-rehearsal r/nixie-conversation@sha256:aa11 r/nixie-fetch@sha256:bb22 r/nixie-backup@sha256:ab12 r/nixie-web@sha256:cc33 r/nixie@sha256:dd44':
        { exitCode: 1 },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({
      PATH: ctx.binPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
      BACKUP: 'r/nixie-backup@sha256:ab12',
      WEB: 'r/nixie-web@sha256:cc33',
      NIXIE: 'r/nixie@sha256:dd44',
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe('');
});
