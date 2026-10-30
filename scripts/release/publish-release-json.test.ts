import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-release-json-'));

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
    scriptPath: join(import.meta.dir, 'publish-release-json.ts'),
  };
}

test('it builds release.json from the notes summaries and publishes it', async () => {
  const ctx = setupTest();

  // the release.json that the stubbed manifest script would write
  writeFileSync(join(ctx.runnerTemp, 'release.json'), '{"version":"0.59.0"}\n');
  createStubProgram(join(ctx.binPath, 'bun'), { callsPath: ctx.callsPath });
  createStubProgram(join(ctx.binPath, 'bash'), { callsPath: ctx.callsPath });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      RUNNER_TEMP: ctx.runnerTemp,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
      TAG: 'v0.59.0',
      VERSION: '0.59.0',
      SHA: 'a1b2c3',
      CONVERSATION: 'ghcr.io/heynixie/nixie-conversation@sha256:aa11',
      FETCH: 'ghcr.io/heynixie/nixie-fetch@sha256:bb22',
      NIXIE: 'ghcr.io/heynixie/nixie@sha256:cc33',
      WEB: 'ghcr.io/heynixie/nixie-web@sha256:dd44',
      MIGRATIONS: '{"count":2}',
      CONFIG_SCHEMA: '{"breaking":false}',
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
  expect(readFileSync(join(ctx.runnerTemp, 'migrations.json'), 'utf8')).toBe('{"count":2}\n');

  expect(readFileSync(join(ctx.runnerTemp, 'config-schema.json'), 'utf8')).toBe(
    '{"breaking":false}\n',
  );

  expect(readFileSync(ctx.callsPath, 'utf8')).toBe(
    [
      `bun apps/server/src/run-release-manifest.ts --version 0.59.0 --commit a1b2c3 --server ghcr.io/heynixie/nixie@sha256:cc33 --web ghcr.io/heynixie/nixie-web@sha256:dd44 --conversation ghcr.io/heynixie/nixie-conversation@sha256:aa11 --fetch ghcr.io/heynixie/nixie-fetch@sha256:bb22 --migrations ${ctx.runnerTemp}/migrations.json --config-schema ${ctx.runnerTemp}/config-schema.json --out ${ctx.runnerTemp}/release.json`,
      `bash .github/scripts/publish-release-assets.sh v0.59.0 ${ctx.runnerTemp}/release.json`,
      '',
    ].join('\n'),
  );

  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe(
    '## release.json\n\n```json\n{"version":"0.59.0"}\n```\n',
  );
});

test('it fails, and publishes nothing, when release.json cannot be built', async () => {
  const ctx = setupTest();

  createStubProgram(join(ctx.binPath, 'bun'), {
    callsPath: ctx.callsPath,
    answers: {
      [`apps/server/src/run-release-manifest.ts --version 0.59.0 --commit a1b2c3 --server ghcr.io/heynixie/nixie@sha256:cc33 --web ghcr.io/heynixie/nixie-web@sha256:dd44 --conversation ghcr.io/heynixie/nixie-conversation@sha256:aa11 --fetch ghcr.io/heynixie/nixie-fetch@sha256:bb22 --migrations ${ctx.runnerTemp}/migrations.json --config-schema ${ctx.runnerTemp}/config-schema.json --out ${ctx.runnerTemp}/release.json`]:
        { exitCode: 1 },
    },
  });

  createStubProgram(join(ctx.binPath, 'bash'), { callsPath: ctx.callsPath });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      RUNNER_TEMP: ctx.runnerTemp,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
      TAG: 'v0.59.0',
      VERSION: '0.59.0',
      SHA: 'a1b2c3',
      CONVERSATION: 'ghcr.io/heynixie/nixie-conversation@sha256:aa11',
      FETCH: 'ghcr.io/heynixie/nixie-fetch@sha256:bb22',
      NIXIE: 'ghcr.io/heynixie/nixie@sha256:cc33',
      WEB: 'ghcr.io/heynixie/nixie-web@sha256:dd44',
      MIGRATIONS: '{"count":2}',
      CONFIG_SCHEMA: '{"breaking":false}',
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
  expect(readFileSync(ctx.callsPath, 'utf8')).not.toInclude('publish-release-assets.sh');
});
