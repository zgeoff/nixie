import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-rehearse-assets-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const summaryPath = join(directory, 'summary');
  const runnerTemp = join(directory, 'runner-temp');

  mkdirSync(runnerTemp);
  writeFileSync(summaryPath, '');

  return {
    runnerTemp,
    binPath: join(directory, 'bin'),
    summaryPath,
    scriptPath: join(import.meta.dir, 'rehearse-release-assets.ts'),
  };
}

test('it builds release.json from the rehearsal digests and rehearses its upload', async () => {
  const ctx = setupTest();

  // the release.json that the stubbed manifest script would write
  writeFileSync(
    join(ctx.runnerTemp, 'release.json'),
    '{"images":{"server":"r/nixie:0.0.0-rehearsal@sha256:dd44","web":"r/nixie-web:0.0.0-rehearsal@sha256:cc33","backup":"r/nixie-backup:0.0.0-rehearsal@sha256:ab12"},"sandboxImages":{"conversation":"r/nixie-conversation:0.0.0-rehearsal@sha256:aa11","fetch":"r/nixie-fetch:0.0.0-rehearsal@sha256:bb22","code":"r/nixie-code:0.0.0-rehearsal@sha256:ee66","codex":"r/nixie-codex:0.0.0-rehearsal@sha256:ff77"}}\n',
  );

  createStubBin(ctx.binPath, 'bun');
  createStubBin(ctx.binPath, 'bash');

  createStubBin(ctx.binPath, 'docker', {
    answers: [
      {
        args: [
          'buildx',
          'imagetools',
          'inspect',
          'r/nixie:0.0.0-rehearsal',
          '--format',
          '{{.Manifest.Digest}}',
        ],
        stdout: 'sha256:dd44\n',
      },
      {
        args: [
          'buildx',
          'imagetools',
          'inspect',
          'r/nixie-web:0.0.0-rehearsal',
          '--format',
          '{{.Manifest.Digest}}',
        ],
        stdout: 'sha256:cc33\n',
      },
      {
        args: [
          'buildx',
          'imagetools',
          'inspect',
          'r/nixie-backup:0.0.0-rehearsal',
          '--format',
          '{{.Manifest.Digest}}',
        ],
        stdout: 'sha256:ab12\n',
      },
      {
        args: [
          'buildx',
          'imagetools',
          'inspect',
          'r/nixie-conversation:0.0.0-rehearsal',
          '--format',
          '{{.Manifest.Digest}}',
        ],
        stdout: 'sha256:aa11\n',
      },
      {
        args: [
          'buildx',
          'imagetools',
          'inspect',
          'r/nixie-fetch:0.0.0-rehearsal',
          '--format',
          '{{.Manifest.Digest}}',
        ],
        stdout: 'sha256:bb22\n',
      },
      {
        args: [
          'buildx',
          'imagetools',
          'inspect',
          'r/nixie-code:0.0.0-rehearsal',
          '--format',
          '{{.Manifest.Digest}}',
        ],
        stdout: 'sha256:ee66\n',
      },
      {
        args: [
          'buildx',
          'imagetools',
          'inspect',
          'r/nixie-codex:0.0.0-rehearsal',
          '--format',
          '{{.Manifest.Digest}}',
        ],
        stdout: 'sha256:ff77\n',
      },
    ],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      RUNNER_TEMP: ctx.runnerTemp,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
      GITHUB_SHA: 'a1b2c3',
      BACKUP: 'r/nixie-backup@sha256:ab12',
      WEB: 'r/nixie-web@sha256:cc33',
      NIXIE: 'r/nixie@sha256:dd44',
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readStubCalls(ctx.binPath)).toMatchObject([
    {
      name: 'bun',
      argv: [
        'libs/db/src/run-migration-check.ts',
        '--summary',
        `${ctx.runnerTemp}/migrations.json`,
      ],
    },
    {
      name: 'bun',
      argv: [
        'apps/server/src/run-config-schema-check.ts',
        '--summary',
        `${ctx.runnerTemp}/config-schema.json`,
      ],
    },
    {
      name: 'bun',
      argv: [
        'apps/server/src/run-release-manifest.ts',
        '--version',
        '0.0.0-rehearsal',
        '--commit',
        'a1b2c3',
        '--server',
        'r/nixie@sha256:dd44',
        '--web',
        'r/nixie-web@sha256:cc33',
        '--sandbox-manifest',
        'apps/server/sandbox-manifest.json',
        '--backup',
        'r/nixie-backup@sha256:ab12',
        '--migrations',
        `${ctx.runnerTemp}/migrations.json`,
        '--config-schema',
        `${ctx.runnerTemp}/config-schema.json`,
        '--out',
        `${ctx.runnerTemp}/release.json`,
      ],
    },
    {
      name: 'docker',
      argv: [
        'buildx',
        'imagetools',
        'inspect',
        'r/nixie:0.0.0-rehearsal',
        '--format',
        '{{.Manifest.Digest}}',
      ],
    },
    {
      name: 'docker',
      argv: [
        'buildx',
        'imagetools',
        'inspect',
        'r/nixie-web:0.0.0-rehearsal',
        '--format',
        '{{.Manifest.Digest}}',
      ],
    },
    {
      name: 'docker',
      argv: [
        'buildx',
        'imagetools',
        'inspect',
        'r/nixie-backup:0.0.0-rehearsal',
        '--format',
        '{{.Manifest.Digest}}',
      ],
    },
    {
      name: 'docker',
      argv: [
        'buildx',
        'imagetools',
        'inspect',
        'r/nixie-conversation:0.0.0-rehearsal',
        '--format',
        '{{.Manifest.Digest}}',
      ],
    },
    {
      name: 'docker',
      argv: [
        'buildx',
        'imagetools',
        'inspect',
        'r/nixie-fetch:0.0.0-rehearsal',
        '--format',
        '{{.Manifest.Digest}}',
      ],
    },
    {
      name: 'docker',
      argv: [
        'buildx',
        'imagetools',
        'inspect',
        'r/nixie-code:0.0.0-rehearsal',
        '--format',
        '{{.Manifest.Digest}}',
      ],
    },
    {
      name: 'docker',
      argv: [
        'buildx',
        'imagetools',
        'inspect',
        'r/nixie-codex:0.0.0-rehearsal',
        '--format',
        '{{.Manifest.Digest}}',
      ],
    },
    {
      name: 'bash',
      argv: [
        'scripts/release/publish-release-assets.sh',
        'v0.0.0-rehearsal',
        `${ctx.runnerTemp}/release.json`,
      ],
    },
  ]);

  expect(readFileSync(ctx.summaryPath, 'utf8')).toStartWith(
    '## release.json\n\n```json\n{"images":',
  );
});

test('it fails, and uploads nothing, when a tag in release.json names another digest', async () => {
  const ctx = setupTest();

  writeFileSync(
    join(ctx.runnerTemp, 'release.json'),
    '{"images":{"server":"r/nixie:0.0.0-rehearsal@sha256:dd44","web":"r/nixie-web:0.0.0-rehearsal@sha256:cc33","backup":"r/nixie-backup:0.0.0-rehearsal@sha256:ab12"},"sandboxImages":{"conversation":"r/nixie-conversation:0.0.0-rehearsal@sha256:aa11","fetch":"r/nixie-fetch:0.0.0-rehearsal@sha256:bb22","code":"r/nixie-code:0.0.0-rehearsal@sha256:ee66","codex":"r/nixie-codex:0.0.0-rehearsal@sha256:ff77"}}\n',
  );

  createStubBin(ctx.binPath, 'bun');
  createStubBin(ctx.binPath, 'bash');

  createStubBin(ctx.binPath, 'docker', {
    answers: [
      {
        args: [
          'buildx',
          'imagetools',
          'inspect',
          'r/nixie:0.0.0-rehearsal',
          '--format',
          '{{.Manifest.Digest}}',
        ],
        stdout: 'sha256:ee55\n',
      },
    ],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      RUNNER_TEMP: ctx.runnerTemp,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
      GITHUB_SHA: 'a1b2c3',
      BACKUP: 'r/nixie-backup@sha256:ab12',
      WEB: 'r/nixie-web@sha256:cc33',
      NIXIE: 'r/nixie@sha256:dd44',
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toBe(
    '::error::release.json names r/nixie:0.0.0-rehearsal@sha256:dd44, but r/nixie:0.0.0-rehearsal names sha256:ee55\n',
  );

  expect(readStubCalls(ctx.binPath).flatMap((call) => call.argv)).not.toContainEqual(
    expect.stringContaining('publish-release-assets.sh'),
  );
});

test('it fails when release.json leaves out a sandbox image', async () => {
  const ctx = setupTest();

  writeFileSync(
    join(ctx.runnerTemp, 'release.json'),
    '{"images":{"server":"r/nixie:0.0.0-rehearsal@sha256:dd44","web":"r/nixie-web:0.0.0-rehearsal@sha256:cc33","backup":"r/nixie-backup:0.0.0-rehearsal@sha256:ab12"},"sandboxImages":{"conversation":"r/nixie-conversation:0.0.0-rehearsal@sha256:aa11"}}\n',
  );

  createStubBin(ctx.binPath, 'bun');
  createStubBin(ctx.binPath, 'bash');
  createStubBin(ctx.binPath, 'docker');

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: ctx.binPath,
      RUNNER_TEMP: ctx.runnerTemp,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
      GITHUB_SHA: 'a1b2c3',
      BACKUP: 'r/nixie-backup@sha256:ab12',
      WEB: 'r/nixie-web@sha256:cc33',
      NIXIE: 'r/nixie@sha256:dd44',
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toInclude('"fetch"');
  expect(readStubCalls(ctx.binPath).map((call) => call.name)).not.toContain('docker');
});
