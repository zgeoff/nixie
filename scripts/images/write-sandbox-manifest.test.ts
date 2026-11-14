import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-write-sandbox-manifest-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  mkdirSync(join(directory, 'apps', 'server'), { recursive: true });

  return {
    repoPath: directory,
    scriptPath: join(import.meta.dir, 'write-sandbox-manifest.ts'),
  };
}

test('it writes the manifest of the digests that the build steps gave, under the registry', async () => {
  const ctx = setupTest();

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({
      PATH: process.env['PATH'] ?? '',
      REGISTRY: 'localhost:5000',
      STEPS: JSON.stringify({
        'setup-buildx': { outputs: {} },
        fetch: { outputs: { digest: 'sha256:bb22' } },
        conversation: { outputs: { digest: 'sha256:aa11' } },
        web: { outputs: { digest: 'sha256:cc33' } },
      }),
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(join(ctx.repoPath, 'apps', 'server', 'sandbox-manifest.json'), 'utf8')).toBe(
    '{"conversation":"localhost:5000/nixie-conversation@sha256:aa11","fetch":"localhost:5000/nixie-fetch@sha256:bb22"}\n',
  );
});

test('it fails when no build step gave the digest of a key', async () => {
  const ctx = setupTest();

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .cwd(ctx.repoPath)
    .env({
      PATH: process.env['PATH'] ?? '',
      REGISTRY: 'localhost:5000',
      STEPS: JSON.stringify({ conversation: { outputs: { digest: 'sha256:aa11' } } }),
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toInclude('fetch');
});
