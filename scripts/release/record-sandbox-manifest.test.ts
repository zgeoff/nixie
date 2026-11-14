import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-record-sandbox-manifest-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const outputPath = join(directory, 'output');
  const summaryPath = join(directory, 'summary');

  writeFileSync(outputPath, '');
  writeFileSync(summaryPath, '');

  return {
    outputPath,
    summaryPath,
    scriptPath: join(import.meta.dir, 'record-sandbox-manifest.ts'),
  };
}

test('it outputs the manifest of the image jobs and adds it to the summary', async () => {
  const ctx = setupTest();

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: process.env['PATH'] ?? '',
      NEEDS: JSON.stringify({
        resolve: { outputs: { sha: 'a1b2c3' } },
        fetch: { outputs: { ref: 'ghcr.io/heynixie/nixie-fetch@sha256:bb22' } },
        conversation: { outputs: { ref: 'ghcr.io/heynixie/nixie-conversation@sha256:aa11' } },
      }),
      GITHUB_OUTPUT: ctx.outputPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(readFileSync(ctx.outputPath, 'utf8')).toBe(
    'json={"conversation":"ghcr.io/heynixie/nixie-conversation@sha256:aa11","fetch":"ghcr.io/heynixie/nixie-fetch@sha256:bb22"}\n',
  );

  expect(readFileSync(ctx.summaryPath, 'utf8')).toBe(
    '{"conversation":"ghcr.io/heynixie/nixie-conversation@sha256:aa11","fetch":"ghcr.io/heynixie/nixie-fetch@sha256:bb22"}\n',
  );
});

test('it fails, and outputs nothing, when an image job is missing from the needs', async () => {
  const ctx = setupTest();

  const result = await $`${process.execPath} ${ctx.scriptPath}`
    .env({
      PATH: process.env['PATH'] ?? '',
      NEEDS: JSON.stringify({
        conversation: { outputs: { ref: 'ghcr.io/heynixie/nixie-conversation@sha256:aa11' } },
      }),
      GITHUB_OUTPUT: ctx.outputPath,
      GITHUB_STEP_SUMMARY: ctx.summaryPath,
    })
    .nothrow()
    .quiet();

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toInclude('fetch');
  expect(readFileSync(ctx.outputPath, 'utf8')).toBe('');
});
