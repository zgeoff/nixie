import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubBin, readStubCalls } from '@zgeoff/testing/bin';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-pinned-digests-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const summaryPath = join(directory, 'summary');

  mkdirSync(join(directory, 'deploy', 'compose'), { recursive: true });
  writeFileSync(summaryPath, '');

  return {
    repoPath: directory,
    binPath: join(directory, 'bin'),
    summaryPath,
    scriptPath: join(import.meta.dir, 'check-pinned-digests.ts'),
  };
}

test('it lists each pinned image in the summary when every tag resolves to its pin', async () => {
  const ctx = setupTest();

  writeFileSync(
    join(ctx.repoPath, 'deploy', 'compose', 'compose.yaml'),
    [
      'services:',
      '  proxy:',
      `    image: caddy:2.11.7-alpine@sha256:${'a'.repeat(64)}`,
      '  nixie:',
      `    image: ghcr.io/heynixie/nixie:0.58.0@sha256:${'b'.repeat(64)}`,
      '',
    ].join('\n'),
  );

  createStubBin(ctx.binPath, 'docker', {
    answers: [
      {
        args: [
          'buildx',
          'imagetools',
          'inspect',
          'caddy:2.11.7-alpine',
          '--format',
          '{{json .Manifest.Digest}}',
        ],
        stdout: `"sha256:${'a'.repeat(64)}"\n`,
      },
      {
        args: [
          'buildx',
          'imagetools',
          'inspect',
          'ghcr.io/heynixie/nixie:0.58.0',
          '--format',
          '{{json .Manifest.Digest}}',
        ],
        stdout: `"sha256:${'b'.repeat(64)}"\n`,
      },
    ],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, GITHUB_STEP_SUMMARY: ctx.summaryPath })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe(
    `caddy:2.11.7-alpine@sha256:${'a'.repeat(64)}\nghcr.io/heynixie/nixie:0.58.0@sha256:${'b'.repeat(64)}\n`,
  );
});

test('it fails, naming both digests, when a tag resolves to another digest', async () => {
  const ctx = setupTest();

  writeFileSync(
    join(ctx.repoPath, 'deploy', 'compose', 'compose.yaml'),
    `services:\n  proxy:\n    image: caddy:2.11.7-alpine@sha256:${'a'.repeat(64)}\n`,
  );

  createStubBin(ctx.binPath, 'docker', {
    answers: [
      {
        args: [
          'buildx',
          'imagetools',
          'inspect',
          'caddy:2.11.7-alpine',
          '--format',
          '{{json .Manifest.Digest}}',
        ],
        stdout: `"sha256:${'c'.repeat(64)}"\n`,
      },
    ],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, GITHUB_STEP_SUMMARY: ctx.summaryPath })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toBe(
    `::error::caddy:2.11.7-alpine resolves to sha256:${'c'.repeat(64)}, and compose.yaml pins sha256:${'a'.repeat(64)}\n`,
  );

  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe('');
});

test('it fails when the recipe names an image without a digest', async () => {
  const ctx = setupTest();

  writeFileSync(
    join(ctx.repoPath, 'deploy', 'compose', 'compose.yaml'),
    [
      'services:',
      '  proxy:',
      `    image: caddy:2.11.7-alpine@sha256:${'a'.repeat(64)}`,
      '  setup:',
      '    image: busybox:1.37',
      '',
    ].join('\n'),
  );

  createStubBin(ctx.binPath, 'docker', {
    answers: [
      {
        args: [
          'buildx',
          'imagetools',
          'inspect',
          'caddy:2.11.7-alpine',
          '--format',
          '{{json .Manifest.Digest}}',
        ],
        stdout: `"sha256:${'a'.repeat(64)}"\n`,
      },
    ],
  });

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, GITHUB_STEP_SUMMARY: ctx.summaryPath })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toBe(
    '::error::compose.yaml names an image without a tag and digest\n',
  );
});

test('it inspects an image that two services pin only once', async () => {
  const ctx = setupTest();

  writeFileSync(
    join(ctx.repoPath, 'deploy', 'compose', 'compose.yaml'),
    [
      'services:',
      '  setup:',
      `    image: busybox:1.37@sha256:${'d'.repeat(64)}`,
      '  enrol:',
      `    image: busybox:1.37@sha256:${'d'.repeat(64)}`,
      '',
    ].join('\n'),
  );

  createStubBin(ctx.binPath, 'docker', {
    answers: [
      {
        args: [
          'buildx',
          'imagetools',
          'inspect',
          'busybox:1.37',
          '--format',
          '{{json .Manifest.Digest}}',
        ],
        stdout: `"sha256:${'d'.repeat(64)}"\n`,
      },
    ],
  });

  await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({ PATH: ctx.binPath, GITHUB_STEP_SUMMARY: ctx.summaryPath })
    .quiet();

  expect(readStubCalls(ctx.binPath)).toMatchObject([
    {
      name: 'docker',
      argv: [
        'buildx',
        'imagetools',
        'inspect',
        'busybox:1.37',
        '--format',
        '{{json .Manifest.Digest}}',
      ],
    },
  ]);
});
