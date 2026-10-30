import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-resolve-release-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const outputPath = join(directory, 'output');
  const summaryPath = join(directory, 'summary');

  writeFileSync(outputPath, '');
  writeFileSync(summaryPath, '');

  return { outputPath, summaryPath, scriptPath: join(import.meta.dir, 'resolve-release.ts') };
}

test('it releases the tag that release-please created on this run commit', async () => {
  const ctx = setupTest();

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF_TYPE: 'branch',
      GITHUB_REF_NAME: 'main',
      CREATED_TAG: 'v0.59.0',
      CREATED_SHA: 'a1b2c3',
      GITHUB_SHA: 'a1b2c3',
      GITHUB_OUTPUT: ctx.outputPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
  expect(readFileSync(ctx.outputPath, 'utf8')).toBe('tag=v0.59.0\nversion=0.59.0\nsha=a1b2c3\n');
  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe('Releasing v0.59.0 from a1b2c3\n');
});

test('it refuses a push run whose commit is not the one release-please tagged', async () => {
  const ctx = setupTest();

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF_TYPE: 'branch',
      GITHUB_REF_NAME: 'main',
      CREATED_TAG: 'v0.59.0',
      CREATED_SHA: 'a1b2c3',
      GITHUB_SHA: 'd4e5f6',
      GITHUB_OUTPUT: ctx.outputPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toBe(
    "::error::release-please tagged a1b2c3, not this run's commit d4e5f6. Rebuild with: gh workflow run release.yml --ref v0.59.0\n",
  );

  expect(readFileSync(ctx.outputPath, 'utf8')).toBe('');
});

test('it releases the tag a manual run starts on', async () => {
  const ctx = setupTest();

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF_TYPE: 'tag',
      GITHUB_REF_NAME: 'v0.58.0',
      CREATED_TAG: '',
      CREATED_SHA: '',
      GITHUB_SHA: 'b2c3d4',
      GITHUB_OUTPUT: ctx.outputPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
  expect(readFileSync(ctx.outputPath, 'utf8')).toBe('tag=v0.58.0\nversion=0.58.0\nsha=b2c3d4\n');
});

test('it refuses a manual run on a branch', async () => {
  const ctx = setupTest();

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF_TYPE: 'branch',
      GITHUB_REF_NAME: 'main',
      CREATED_TAG: '',
      CREATED_SHA: '',
      GITHUB_SHA: 'b2c3d4',
      GITHUB_OUTPUT: ctx.outputPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toBe(
    '::error::start a manual run on a release tag: gh workflow run release.yml --ref v<version>\n',
  );
});

test('it refuses a manual run on a tag that is not a release tag', async () => {
  const ctx = setupTest();

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF_TYPE: 'tag',
      GITHUB_REF_NAME: 'v0.58.0-rc.1',
      CREATED_TAG: '',
      CREATED_SHA: '',
      GITHUB_SHA: 'b2c3d4',
      GITHUB_OUTPUT: ctx.outputPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toBe(
    '::error::v0.58.0-rc.1 is not a release tag of the form v<major>.<minor>.<patch>\n',
  );
});
