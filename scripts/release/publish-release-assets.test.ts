import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubProgram } from '../test-utils/create-stub-program.ts';

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

  // a gh that records each call and fails the upload that the test names
  const runPublish = async (failingUpload?: string) => {
    createStubProgram(join(directory, 'bin', 'gh'), {
      callsPath,
      answers: failingUpload === undefined ? {} : { [failingUpload.slice(3)]: { exitCode: 1 } },
    });

    const result =
      await $`bash ${join(import.meta.dir, 'publish-release-assets.sh')} v0.0.0-rehearsal ${releasePath}`
        .cwd(join(import.meta.dir, '../..'))
        .env({ ...process.env, PATH: `${join(directory, 'bin')}:${process.env['PATH'] ?? ''}` })
        .nothrow()
        .quiet();

    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      calls: readFileSync(callsPath, 'utf8'),
    };
  };

  return { releasePath, uploads, runPublish };
}

test('it uploads the config schema and both definitions schemas, then release.json', async () => {
  const ctx = setupTest();

  const result = await ctx.runPublish();

  expect(result).toStrictEqual({
    exitCode: 0,
    stdout: '',
    calls: `${ctx.uploads.config}\n${ctx.uploads.manifest}\n${ctx.uploads.rules}\n${ctx.uploads.release}\n`,
  });
});

test('it stops before release.json when the config schema upload fails', async () => {
  const ctx = setupTest();

  const result = await ctx.runPublish(ctx.uploads.config);

  expect(result.exitCode).toBe(1);
  expect(result.calls).toBe(`${ctx.uploads.config}\n`);
});

test('it stops before release.json when the definitions manifest schema upload fails', async () => {
  const ctx = setupTest();

  const result = await ctx.runPublish(ctx.uploads.manifest);

  expect(result.exitCode).toBe(1);
  expect(result.calls).toBe(`${ctx.uploads.config}\n${ctx.uploads.manifest}\n`);
});

test('it stops before release.json when the definitions rules schema upload fails', async () => {
  const ctx = setupTest();

  const result = await ctx.runPublish(ctx.uploads.rules);

  expect(result.exitCode).toBe(1);

  expect(result.calls).toBe(
    `${ctx.uploads.config}\n${ctx.uploads.manifest}\n${ctx.uploads.rules}\n`,
  );
});

test('it uploads nothing when release.json points to another asset', async () => {
  const ctx = setupTest();

  writeFileSync(ctx.releasePath, '{"configSchema":{"asset":"other.schema.json"}}\n');

  const result = await ctx.runPublish();

  expect(result).toStrictEqual({
    exitCode: 1,
    stdout:
      '::error::release.json points to the asset other.schema.json, but the release uploads config.schema.json\n',
    calls: '',
  });
});
