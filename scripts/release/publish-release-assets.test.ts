import { expect, onTestFinished, test } from 'bun:test';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-publish-release-assets-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const callsPath = join(directory, 'calls');
  const releasePath = join(directory, 'release.json');

  writeFileSync(callsPath, '');
  writeFileSync(releasePath, '{"configSchema":{"asset":"config.schema.json"}}\n');

  const uploads = {
    config: 'gh release upload v0.0.0-rehearsal apps/server/config.schema.json --clobber',
    manifest:
      'gh release upload v0.0.0-rehearsal modules/definitions/definitions-manifest.schema.json --clobber',
    rules:
      'gh release upload v0.0.0-rehearsal modules/policy/definitions-rules.schema.json --clobber',
    release: `gh release upload v0.0.0-rehearsal ${releasePath} --clobber`,
  };

  const repoRoot = join(import.meta.dir, '../..');
  const uploadedPath = join(directory, 'uploaded');

  // a gh that records each call, fails the upload that the test names, and keeps each file it
  // uploads, so a path that does not exist fails the upload as it does against GitHub
  const runPublish = async (failingUpload?: string, cwd = repoRoot) => {
    const stubPath = join(directory, 'bin', 'gh');

    mkdirSync(join(directory, 'bin'), { recursive: true });
    mkdirSync(uploadedPath, { recursive: true });

    writeFileSync(
      stubPath,
      [
        '#!/usr/bin/env bash',
        String.raw`printf 'gh %s\n' "$*" >> "$STUB_CALLS"`,
        '[[ -n "$STUB_FAIL" && "gh $*" == "$STUB_FAIL" ]] && exit 1',
        'cp "$4" "$STUB_UPLOADED/"',
        '',
      ].join('\n'),
    );

    chmodSync(stubPath, 0o755);

    const result =
      await $`bash ${join(import.meta.dir, 'publish-release-assets.sh')} v0.0.0-rehearsal ${releasePath}`
        .cwd(cwd)
        .env({
          ...process.env,
          PATH: `${join(directory, 'bin')}:${process.env['PATH'] ?? ''}`,
          STUB_CALLS: callsPath,
          STUB_FAIL: failingUpload ?? '',
          STUB_UPLOADED: uploadedPath,
        })
        .nothrow()
        .quiet();

    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
      calls: readFileSync(callsPath, 'utf8'),
    };
  };

  return { releasePath, uploads, uploadedPath, repoRoot, runPublish };
}

test('it uploads the config schema and both definitions schemas, then release.json', async () => {
  const ctx = setupTest();

  const result = await ctx.runPublish();

  expect(result).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: '',
    calls: `${ctx.uploads.config}\n${ctx.uploads.manifest}\n${ctx.uploads.rules}\n${ctx.uploads.release}\n`,
  });
});

test('it uploads a copy of each source file', async () => {
  const ctx = setupTest();

  await ctx.runPublish();

  const readUploaded = (name: string) => readFileSync(join(ctx.uploadedPath, name), 'utf8');
  const readSource = (path: string) => readFileSync(join(ctx.repoRoot, path), 'utf8');

  expect({
    names: readdirSync(ctx.uploadedPath).toSorted(),
    config: readUploaded('config.schema.json'),
    manifest: readUploaded('definitions-manifest.schema.json'),
    rules: readUploaded('definitions-rules.schema.json'),
    release: readUploaded('release.json'),
  }).toStrictEqual({
    names: [
      'config.schema.json',
      'definitions-manifest.schema.json',
      'definitions-rules.schema.json',
      'release.json',
    ],
    config: readSource('apps/server/config.schema.json'),
    manifest: readSource('modules/definitions/definitions-manifest.schema.json'),
    rules: readSource('modules/policy/definitions-rules.schema.json'),
    release: readFileSync(ctx.releasePath, 'utf8'),
  });
});

test('it fails the run when a schema file does not exist', async () => {
  const ctx = setupTest();

  const result = await ctx.runPublish(undefined, tmpdir());

  expect({ ...result, uploaded: readdirSync(ctx.uploadedPath) }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr: "cp: cannot stat 'apps/server/config.schema.json': No such file or directory\n",
    calls: `${ctx.uploads.config}\n`,
    uploaded: [],
  });
});

test('it stops before release.json when the config schema upload fails', async () => {
  const ctx = setupTest();

  const result = await ctx.runPublish(ctx.uploads.config);

  expect(result).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr: '',
    calls: `${ctx.uploads.config}\n`,
  });
});

test('it stops before release.json when the definitions manifest schema upload fails', async () => {
  const ctx = setupTest();

  const result = await ctx.runPublish(ctx.uploads.manifest);

  expect(result).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr: '',
    calls: `${ctx.uploads.config}\n${ctx.uploads.manifest}\n`,
  });
});

test('it stops before release.json when the definitions rules schema upload fails', async () => {
  const ctx = setupTest();

  const result = await ctx.runPublish(ctx.uploads.rules);

  expect(result).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr: '',
    calls: `${ctx.uploads.config}\n${ctx.uploads.manifest}\n${ctx.uploads.rules}\n`,
  });
});

test('it uploads nothing when release.json points to another asset', async () => {
  const ctx = setupTest();

  writeFileSync(ctx.releasePath, '{"configSchema":{"asset":"other.schema.json"}}\n');

  const result = await ctx.runPublish();

  expect(result).toStrictEqual({
    exitCode: 1,
    stdout:
      '::error::release.json points to the asset other.schema.json, but the release uploads config.schema.json\n',
    stderr: '',
    calls: '',
  });
});
