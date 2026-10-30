import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-rehearse-assets-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');
  const summaryPath = join(directory, 'summary');
  const runnerTemp = join(directory, 'runner-temp');

  mkdirSync(runnerTemp);
  writeFileSync(callsPath, '');
  writeFileSync(summaryPath, '');

  return {
    runnerTemp,
    binPath: join(directory, 'bin'),
    callsPath,
    summaryPath,
    scriptPath: join(import.meta.dir, 'rehearse-release-assets.ts'),
  };
}

test('it builds release.json from the rehearsal digests and rehearses its upload', async () => {
  const ctx = setupTest();

  // the release.json that the stubbed manifest script would write
  writeFileSync(
    join(ctx.runnerTemp, 'release.json'),
    '{"images":{"server":"r/nixie:0.0.0-rehearsal@sha256:dd44","web":"r/nixie-web:0.0.0-rehearsal@sha256:cc33"},"sandboxImages":{"conversation":"r/nixie-conversation:0.0.0-rehearsal@sha256:aa11","fetch":"r/nixie-fetch:0.0.0-rehearsal@sha256:bb22"}}\n',
  );

  createStubProgram(join(ctx.binPath, 'bun'), { callsPath: ctx.callsPath });
  createStubProgram(join(ctx.binPath, 'bash'), { callsPath: ctx.callsPath });

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: {
      'buildx imagetools inspect r/nixie:0.0.0-rehearsal --format {{.Manifest.Digest}}': {
        stdout: 'sha256:dd44\n',
      },
      'buildx imagetools inspect r/nixie-web:0.0.0-rehearsal --format {{.Manifest.Digest}}': {
        stdout: 'sha256:cc33\n',
      },
      'buildx imagetools inspect r/nixie-conversation:0.0.0-rehearsal --format {{.Manifest.Digest}}':
        { stdout: 'sha256:aa11\n' },
      'buildx imagetools inspect r/nixie-fetch:0.0.0-rehearsal --format {{.Manifest.Digest}}': {
        stdout: 'sha256:bb22\n',
      },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      RUNNER_TEMP: ctx.runnerTemp,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
      GITHUB_SHA: 'a1b2c3',
      CONVERSATION: 'r/nixie-conversation@sha256:aa11',
      FETCH: 'r/nixie-fetch@sha256:bb22',
      WEB: 'r/nixie-web@sha256:cc33',
      NIXIE: 'r/nixie@sha256:dd44',
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(ctx.callsPath, 'utf8')).toBe(
    [
      `bun libs/db/src/run-migration-check.ts --summary ${ctx.runnerTemp}/migrations.json`,
      `bun apps/server/src/run-config-schema-check.ts --summary ${ctx.runnerTemp}/config-schema.json`,
      `bun apps/server/src/run-release-manifest.ts --version 0.0.0-rehearsal --commit a1b2c3 --server r/nixie@sha256:dd44 --web r/nixie-web@sha256:cc33 --conversation r/nixie-conversation@sha256:aa11 --fetch r/nixie-fetch@sha256:bb22 --migrations ${ctx.runnerTemp}/migrations.json --config-schema ${ctx.runnerTemp}/config-schema.json --out ${ctx.runnerTemp}/release.json`,
      'docker buildx imagetools inspect r/nixie:0.0.0-rehearsal --format {{.Manifest.Digest}}',
      'docker buildx imagetools inspect r/nixie-web:0.0.0-rehearsal --format {{.Manifest.Digest}}',
      'docker buildx imagetools inspect r/nixie-conversation:0.0.0-rehearsal --format {{.Manifest.Digest}}',
      'docker buildx imagetools inspect r/nixie-fetch:0.0.0-rehearsal --format {{.Manifest.Digest}}',
      `bash .github/scripts/check-publish-release-assets.sh ${ctx.runnerTemp}/release.json`,
      '',
    ].join('\n'),
  );

  expect(readFileSync(ctx.summaryPath, 'utf8')).toStartWith(
    '## release.json\n\n```json\n{"images":',
  );
});

test('it fails, and uploads nothing, when a tag in release.json names another digest', async () => {
  const ctx = setupTest();

  writeFileSync(
    join(ctx.runnerTemp, 'release.json'),
    '{"images":{"server":"r/nixie:0.0.0-rehearsal@sha256:dd44","web":"r/nixie-web:0.0.0-rehearsal@sha256:cc33"},"sandboxImages":{"conversation":"r/nixie-conversation:0.0.0-rehearsal@sha256:aa11","fetch":"r/nixie-fetch:0.0.0-rehearsal@sha256:bb22"}}\n',
  );

  createStubProgram(join(ctx.binPath, 'bun'), { callsPath: ctx.callsPath });
  createStubProgram(join(ctx.binPath, 'bash'), { callsPath: ctx.callsPath });

  createStubProgram(join(ctx.binPath, 'docker'), {
    callsPath: ctx.callsPath,
    answers: {
      'buildx imagetools inspect r/nixie:0.0.0-rehearsal --format {{.Manifest.Digest}}': {
        stdout: 'sha256:ee55\n',
      },
    },
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      RUNNER_TEMP: ctx.runnerTemp,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
      GITHUB_SHA: 'a1b2c3',
      CONVERSATION: 'r/nixie-conversation@sha256:aa11',
      FETCH: 'r/nixie-fetch@sha256:bb22',
      WEB: 'r/nixie-web@sha256:cc33',
      NIXIE: 'r/nixie@sha256:dd44',
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toBe(
    '::error::release.json names r/nixie:0.0.0-rehearsal@sha256:dd44, but r/nixie:0.0.0-rehearsal names sha256:ee55\n',
  );

  expect(readFileSync(ctx.callsPath, 'utf8')).not.toInclude('check-publish-release-assets.sh');
});

test('it fails when release.json leaves out a sandbox image', async () => {
  const ctx = setupTest();

  writeFileSync(
    join(ctx.runnerTemp, 'release.json'),
    '{"images":{"server":"r/nixie:0.0.0-rehearsal@sha256:dd44","web":"r/nixie-web:0.0.0-rehearsal@sha256:cc33"},"sandboxImages":{"conversation":"r/nixie-conversation:0.0.0-rehearsal@sha256:aa11"}}\n',
  );

  createStubProgram(join(ctx.binPath, 'bun'), { callsPath: ctx.callsPath });
  createStubProgram(join(ctx.binPath, 'bash'), { callsPath: ctx.callsPath });
  createStubProgram(join(ctx.binPath, 'docker'), { callsPath: ctx.callsPath });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      RUNNER_TEMP: ctx.runnerTemp,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
      GITHUB_SHA: 'a1b2c3',
      CONVERSATION: 'r/nixie-conversation@sha256:aa11',
      FETCH: 'r/nixie-fetch@sha256:bb22',
      WEB: 'r/nixie-web@sha256:cc33',
      NIXIE: 'r/nixie@sha256:dd44',
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toInclude('"fetch"');
  expect(readFileSync(ctx.callsPath, 'utf8')).not.toInclude('docker');
});
