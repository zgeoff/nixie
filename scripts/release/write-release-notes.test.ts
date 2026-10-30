import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-release-notes-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');
  const outputPath = join(directory, 'output');
  const summaryPath = join(directory, 'summary');
  const runnerTemp = join(directory, 'runner-temp');

  mkdirSync(runnerTemp);
  writeFileSync(callsPath, '');
  writeFileSync(outputPath, '');
  writeFileSync(summaryPath, '');

  return {
    runnerTemp,
    binPath: join(directory, 'bin'),
    callsPath,
    outputPath,
    summaryPath,
    scriptPath: join(import.meta.dir, 'write-release-notes.ts'),
  };
}

test('it checks both against the last release and appends the images to the notes', async () => {
  const ctx = setupTest();

  // the summaries that the stubbed checks would write
  writeFileSync(join(ctx.runnerTemp, 'migrations.json'), '{\n  "count": 2\n}\n');
  writeFileSync(join(ctx.runnerTemp, 'config-schema.json'), '{\n  "breaking": false\n}\n');

  createStubProgram(join(ctx.binPath, 'gh'), {
    callsPath: ctx.callsPath,
    answers: {
      'release view v0.59.0 --json body --jq .body': { stdout: '## Features\n\n- add tasks\n' },
    },
  });

  createStubProgram(join(ctx.binPath, 'git'), {
    callsPath: ctx.callsPath,
    answers: {
      'describe --tags --abbrev=0 --match v* a1b2c3^': { stdout: 'v0.58.0\n' },
      'show v0.58.0:apps/server/config.schema.json': { stdout: '{"type":"object"}\n' },
    },
  });

  createStubProgram(join(ctx.binPath, 'bash'), { callsPath: ctx.callsPath });
  createStubProgram(join(ctx.binPath, 'bun'), { callsPath: ctx.callsPath });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      TAG: 'v0.59.0',
      SHA: 'a1b2c3',
      RUNNER_TEMP: ctx.runnerTemp,
      CONVERSATION: 'ghcr.io/heynixie/nixie-conversation@sha256:aa11',
      FETCH: 'ghcr.io/heynixie/nixie-fetch@sha256:bb22',
      NIXIE: 'ghcr.io/heynixie/nixie@sha256:cc33',
      WEB: 'ghcr.io/heynixie/nixie-web@sha256:dd44',
      GITHUB_OUTPUT: ctx.outputPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(ctx.callsPath, 'utf8')).toBe(
    [
      'gh release view v0.59.0 --json body --jq .body',
      'git describe --tags --abbrev=0 --match v* a1b2c3^',
      `bash .github/scripts/read-released-schema.sh v0.58.0 ${ctx.runnerTemp}/released.json`,
      `bun libs/db/src/run-migration-check.ts --released ${ctx.runnerTemp}/released.json --last-tag v0.58.0 --release-body ${ctx.runnerTemp}/body.md --summary ${ctx.runnerTemp}/migrations.json`,
      'git show v0.58.0:apps/server/config.schema.json',
      `bun apps/server/src/run-config-schema-check.ts --released ${ctx.runnerTemp}/released-config.schema.json --last-tag v0.58.0 --release-body ${ctx.runnerTemp}/body.md --summary ${ctx.runnerTemp}/config-schema.json`,
      `gh release edit v0.59.0 --notes-file ${ctx.runnerTemp}/body.md`,
      '',
    ].join('\n'),
  );

  expect(readFileSync(join(ctx.runnerTemp, 'released-config.schema.json'), 'utf8')).toBe(
    '{"type":"object"}\n',
  );
});

test('it outputs both summaries as one-line JSON', async () => {
  const ctx = setupTest();

  writeFileSync(join(ctx.runnerTemp, 'migrations.json'), '{\n  "count": 2\n}\n');
  writeFileSync(join(ctx.runnerTemp, 'config-schema.json'), '{\n  "breaking": false\n}\n');
  createStubProgram(join(ctx.binPath, 'gh'), { callsPath: ctx.callsPath });
  createStubProgram(join(ctx.binPath, 'git'), { callsPath: ctx.callsPath });
  createStubProgram(join(ctx.binPath, 'bash'), { callsPath: ctx.callsPath });
  createStubProgram(join(ctx.binPath, 'bun'), { callsPath: ctx.callsPath });

  await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      TAG: 'v0.59.0',
      SHA: 'a1b2c3',
      RUNNER_TEMP: ctx.runnerTemp,
      CONVERSATION: 'ghcr.io/heynixie/nixie-conversation@sha256:aa11',
      FETCH: 'ghcr.io/heynixie/nixie-fetch@sha256:bb22',
      NIXIE: 'ghcr.io/heynixie/nixie@sha256:cc33',
      WEB: 'ghcr.io/heynixie/nixie-web@sha256:dd44',
      GITHUB_OUTPUT: ctx.outputPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .quiet();

  expect(readFileSync(ctx.outputPath, 'utf8')).toBe(
    'migrations={"count":2}\nconfig-schema={"breaking":false}\n',
  );
});

test('it appends each image to the release notes and the summary', async () => {
  const ctx = setupTest();

  writeFileSync(join(ctx.runnerTemp, 'migrations.json'), '{}\n');
  writeFileSync(join(ctx.runnerTemp, 'config-schema.json'), '{}\n');

  createStubProgram(join(ctx.binPath, 'gh'), {
    callsPath: ctx.callsPath,
    answers: {
      'release view v0.59.0 --json body --jq .body': { stdout: '## Features\n\n- add tasks\n' },
    },
  });

  createStubProgram(join(ctx.binPath, 'git'), { callsPath: ctx.callsPath });
  createStubProgram(join(ctx.binPath, 'bash'), { callsPath: ctx.callsPath });
  createStubProgram(join(ctx.binPath, 'bun'), { callsPath: ctx.callsPath });

  await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      TAG: 'v0.59.0',
      SHA: 'a1b2c3',
      RUNNER_TEMP: ctx.runnerTemp,
      CONVERSATION: 'ghcr.io/heynixie/nixie-conversation@sha256:aa11',
      FETCH: 'ghcr.io/heynixie/nixie-fetch@sha256:bb22',
      NIXIE: 'ghcr.io/heynixie/nixie@sha256:cc33',
      WEB: 'ghcr.io/heynixie/nixie-web@sha256:dd44',
      GITHUB_OUTPUT: ctx.outputPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .quiet();

  const notes = [
    '## Features',
    '',
    '- add tasks',
    '',
    '## Images',
    '',
    '- `ghcr.io/heynixie/nixie-conversation@sha256:aa11`',
    '- `ghcr.io/heynixie/nixie-fetch@sha256:bb22`',
    '- `ghcr.io/heynixie/nixie@sha256:cc33`',
    '- `ghcr.io/heynixie/nixie-web@sha256:dd44`',
    '',
  ].join('\n');

  expect(readFileSync(join(ctx.runnerTemp, 'body.md'), 'utf8')).toBe(notes);
  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe(notes);
});

test('it runs both checks with nothing to compare before the first release', async () => {
  const ctx = setupTest();

  writeFileSync(join(ctx.runnerTemp, 'migrations.json'), '{}\n');
  writeFileSync(join(ctx.runnerTemp, 'config-schema.json'), '{}\n');
  createStubProgram(join(ctx.binPath, 'gh'), { callsPath: ctx.callsPath });

  createStubProgram(join(ctx.binPath, 'git'), {
    callsPath: ctx.callsPath,
    answers: { 'describe --tags --abbrev=0 --match v* a1b2c3^': { exitCode: 128 } },
  });

  createStubProgram(join(ctx.binPath, 'bash'), { callsPath: ctx.callsPath });
  createStubProgram(join(ctx.binPath, 'bun'), { callsPath: ctx.callsPath });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      TAG: 'v0.1.0',
      SHA: 'a1b2c3',
      RUNNER_TEMP: ctx.runnerTemp,
      CONVERSATION: 'ghcr.io/heynixie/nixie-conversation@sha256:aa11',
      FETCH: 'ghcr.io/heynixie/nixie-fetch@sha256:bb22',
      NIXIE: 'ghcr.io/heynixie/nixie@sha256:cc33',
      WEB: 'ghcr.io/heynixie/nixie-web@sha256:dd44',
      GITHUB_OUTPUT: ctx.outputPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(ctx.callsPath, 'utf8')).toBe(
    [
      'gh release view v0.1.0 --json body --jq .body',
      'git describe --tags --abbrev=0 --match v* a1b2c3^',
      `bun libs/db/src/run-migration-check.ts --release-body ${ctx.runnerTemp}/body.md --summary ${ctx.runnerTemp}/migrations.json`,
      `bun apps/server/src/run-config-schema-check.ts --release-body ${ctx.runnerTemp}/body.md --summary ${ctx.runnerTemp}/config-schema.json`,
      `gh release edit v0.1.0 --notes-file ${ctx.runnerTemp}/body.md`,
      '',
    ].join('\n'),
  );
});

test('it checks the config schema with nothing to compare when the last release commits none', async () => {
  const ctx = setupTest();

  writeFileSync(join(ctx.runnerTemp, 'migrations.json'), '{}\n');
  writeFileSync(join(ctx.runnerTemp, 'config-schema.json'), '{}\n');
  createStubProgram(join(ctx.binPath, 'gh'), { callsPath: ctx.callsPath });

  createStubProgram(join(ctx.binPath, 'git'), {
    callsPath: ctx.callsPath,
    answers: {
      'describe --tags --abbrev=0 --match v* a1b2c3^': { stdout: 'v0.20.0\n' },
      'show v0.20.0:apps/server/config.schema.json': { exitCode: 128 },
    },
  });

  createStubProgram(join(ctx.binPath, 'bash'), { callsPath: ctx.callsPath });
  createStubProgram(join(ctx.binPath, 'bun'), { callsPath: ctx.callsPath });

  await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      TAG: 'v0.21.0',
      SHA: 'a1b2c3',
      RUNNER_TEMP: ctx.runnerTemp,
      CONVERSATION: 'ghcr.io/heynixie/nixie-conversation@sha256:aa11',
      FETCH: 'ghcr.io/heynixie/nixie-fetch@sha256:bb22',
      NIXIE: 'ghcr.io/heynixie/nixie@sha256:cc33',
      WEB: 'ghcr.io/heynixie/nixie-web@sha256:dd44',
      GITHUB_OUTPUT: ctx.outputPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .quiet();

  expect(readFileSync(ctx.callsPath, 'utf8')).toInclude(
    `bun apps/server/src/run-config-schema-check.ts --release-body ${ctx.runnerTemp}/body.md --summary ${ctx.runnerTemp}/config-schema.json\n`,
  );
});
