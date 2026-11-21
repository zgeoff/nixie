import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-release-notes-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const outputPath = join(directory, 'output');
  const summaryPath = join(directory, 'summary');
  const runnerTemp = join(directory, 'runner-temp');

  mkdirSync(runnerTemp);
  writeFileSync(outputPath, '');
  writeFileSync(summaryPath, '');

  return {
    runnerTemp,
    binPath: join(directory, 'bin'),
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

  createStubBin(ctx.binPath, 'gh', {
    answers: [
      {
        args: ['release', 'view', 'v0.59.0', '--json', 'body', '--jq', '.body'],
        stdout: '## Features\n\n- add tasks\n',
      },
      { args: [] },
    ],
  });

  createStubBin(ctx.binPath, 'git', {
    answers: [
      {
        args: ['describe', '--tags', '--abbrev=0', '--match', 'v*', 'a1b2c3^'],
        stdout: 'v0.58.0\n',
      },
      { args: ['show', 'v0.58.0:apps/server/config.schema.json'], stdout: '{"type":"object"}\n' },
      { args: [] },
    ],
  });

  createStubBin(ctx.binPath, 'bash');
  createStubBin(ctx.binPath, 'bun');

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      TAG: 'v0.59.0',
      SHA: 'a1b2c3',
      RUNNER_TEMP: ctx.runnerTemp,
      SANDBOX_MANIFEST:
        '{"conversation":"ghcr.io/heynixie/nixie-conversation@sha256:aa11","fetch":"ghcr.io/heynixie/nixie-fetch@sha256:bb22"}',
      BACKUP: 'ghcr.io/heynixie/nixie-backup@sha256:ab12',
      NIXIE: 'ghcr.io/heynixie/nixie@sha256:cc33',
      WEB: 'ghcr.io/heynixie/nixie-web@sha256:dd44',
      GITHUB_OUTPUT: ctx.outputPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readStubCalls(ctx.binPath)).toMatchObject([
    { name: 'gh', argv: ['release', 'view', 'v0.59.0', '--json', 'body', '--jq', '.body'] },
    { name: 'git', argv: ['describe', '--tags', '--abbrev=0', '--match', 'v*', 'a1b2c3^'] },
    { name: 'git', argv: ['show', 'v0.58.0:apps/server/config.schema.json'] },
    {
      name: 'bash',
      argv: [
        '.github/scripts/read-released-schema.sh',
        'v0.58.0',
        `${ctx.runnerTemp}/released.json`,
      ],
    },
    {
      name: 'bun',
      argv: [
        'libs/db/src/run-migration-check.ts',
        '--released',
        `${ctx.runnerTemp}/released.json`,
        '--last-tag',
        'v0.58.0',
        '--release-body',
        `${ctx.runnerTemp}/body.md`,
        '--summary',
        `${ctx.runnerTemp}/migrations.json`,
      ],
    },
    {
      name: 'bun',
      argv: [
        'apps/server/src/run-config-schema-check.ts',
        '--released',
        `${ctx.runnerTemp}/released-config.schema.json`,
        '--last-tag',
        'v0.58.0',
        '--release-body',
        `${ctx.runnerTemp}/body.md`,
        '--summary',
        `${ctx.runnerTemp}/config-schema.json`,
      ],
    },
    {
      name: 'gh',
      argv: ['release', 'edit', 'v0.59.0', '--notes-file', `${ctx.runnerTemp}/body.md`],
    },
  ]);

  expect(readFileSync(join(ctx.runnerTemp, 'released-config.schema.json'), 'utf8')).toBe(
    '{"type":"object"}\n',
  );
});

test('it outputs both summaries as one-line JSON', async () => {
  const ctx = setupTest();

  writeFileSync(join(ctx.runnerTemp, 'migrations.json'), '{\n  "count": 2\n}\n');
  writeFileSync(join(ctx.runnerTemp, 'config-schema.json'), '{\n  "breaking": false\n}\n');
  createStubBin(ctx.binPath, 'gh');
  createStubBin(ctx.binPath, 'git');
  createStubBin(ctx.binPath, 'bash');
  createStubBin(ctx.binPath, 'bun');

  await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      TAG: 'v0.59.0',
      SHA: 'a1b2c3',
      RUNNER_TEMP: ctx.runnerTemp,
      SANDBOX_MANIFEST:
        '{"conversation":"ghcr.io/heynixie/nixie-conversation@sha256:aa11","fetch":"ghcr.io/heynixie/nixie-fetch@sha256:bb22"}',
      BACKUP: 'ghcr.io/heynixie/nixie-backup@sha256:ab12',
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

  createStubBin(ctx.binPath, 'gh', {
    answers: [
      {
        args: ['release', 'view', 'v0.59.0', '--json', 'body', '--jq', '.body'],
        stdout: '## Features\n\n- add tasks\n',
      },
      { args: [] },
    ],
  });

  createStubBin(ctx.binPath, 'git');
  createStubBin(ctx.binPath, 'bash');
  createStubBin(ctx.binPath, 'bun');

  await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      TAG: 'v0.59.0',
      SHA: 'a1b2c3',
      RUNNER_TEMP: ctx.runnerTemp,
      SANDBOX_MANIFEST:
        '{"conversation":"ghcr.io/heynixie/nixie-conversation@sha256:aa11","fetch":"ghcr.io/heynixie/nixie-fetch@sha256:bb22"}',
      BACKUP: 'ghcr.io/heynixie/nixie-backup@sha256:ab12',
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
    '- `ghcr.io/heynixie/nixie-backup@sha256:ab12`',
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
  createStubBin(ctx.binPath, 'gh');

  createStubBin(ctx.binPath, 'git', {
    answers: [
      { args: ['describe', '--tags', '--abbrev=0', '--match', 'v*', 'a1b2c3^'], exitCode: 128 },
      { args: [] },
    ],
  });

  createStubBin(ctx.binPath, 'bash');
  createStubBin(ctx.binPath, 'bun');

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      TAG: 'v0.1.0',
      SHA: 'a1b2c3',
      RUNNER_TEMP: ctx.runnerTemp,
      SANDBOX_MANIFEST:
        '{"conversation":"ghcr.io/heynixie/nixie-conversation@sha256:aa11","fetch":"ghcr.io/heynixie/nixie-fetch@sha256:bb22"}',
      BACKUP: 'ghcr.io/heynixie/nixie-backup@sha256:ab12',
      NIXIE: 'ghcr.io/heynixie/nixie@sha256:cc33',
      WEB: 'ghcr.io/heynixie/nixie-web@sha256:dd44',
      GITHUB_OUTPUT: ctx.outputPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readStubCalls(ctx.binPath)).toMatchObject([
    { name: 'gh', argv: ['release', 'view', 'v0.1.0', '--json', 'body', '--jq', '.body'] },
    { name: 'git', argv: ['describe', '--tags', '--abbrev=0', '--match', 'v*', 'a1b2c3^'] },
    {
      name: 'bun',
      argv: [
        'libs/db/src/run-migration-check.ts',
        '--release-body',
        `${ctx.runnerTemp}/body.md`,
        '--summary',
        `${ctx.runnerTemp}/migrations.json`,
      ],
    },
    {
      name: 'bun',
      argv: [
        'apps/server/src/run-config-schema-check.ts',
        '--release-body',
        `${ctx.runnerTemp}/body.md`,
        '--summary',
        `${ctx.runnerTemp}/config-schema.json`,
      ],
    },
    {
      name: 'gh',
      argv: ['release', 'edit', 'v0.1.0', '--notes-file', `${ctx.runnerTemp}/body.md`],
    },
  ]);
});

test('it checks the config schema with nothing to compare when the last release commits none', async () => {
  const ctx = setupTest();

  writeFileSync(join(ctx.runnerTemp, 'migrations.json'), '{}\n');
  writeFileSync(join(ctx.runnerTemp, 'config-schema.json'), '{}\n');
  createStubBin(ctx.binPath, 'gh');

  createStubBin(ctx.binPath, 'git', {
    answers: [
      {
        args: ['describe', '--tags', '--abbrev=0', '--match', 'v*', 'a1b2c3^'],
        stdout: 'v0.20.0\n',
      },
      { args: ['show', 'v0.20.0:apps/server/config.schema.json'], exitCode: 128 },
      { args: [] },
    ],
  });

  createStubBin(ctx.binPath, 'bash');
  createStubBin(ctx.binPath, 'bun');

  await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      TAG: 'v0.21.0',
      SHA: 'a1b2c3',
      RUNNER_TEMP: ctx.runnerTemp,
      SANDBOX_MANIFEST:
        '{"conversation":"ghcr.io/heynixie/nixie-conversation@sha256:aa11","fetch":"ghcr.io/heynixie/nixie-fetch@sha256:bb22"}',
      BACKUP: 'ghcr.io/heynixie/nixie-backup@sha256:ab12',
      NIXIE: 'ghcr.io/heynixie/nixie@sha256:cc33',
      WEB: 'ghcr.io/heynixie/nixie-web@sha256:dd44',
      GITHUB_OUTPUT: ctx.outputPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .quiet();

  expect(readStubCalls(ctx.binPath)).toContainEqual(
    expect.objectContaining({
      name: 'bun',
      argv: [
        'apps/server/src/run-config-schema-check.ts',
        '--release-body',
        `${ctx.runnerTemp}/body.md`,
        '--summary',
        `${ctx.runnerTemp}/config-schema.json`,
      ],
    }),
  );
});
